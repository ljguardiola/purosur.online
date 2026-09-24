import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { rolePermissions, roles, sessions, userRoles, users } from "../db/schema.js";
import { resolveSourceAddress } from "../recovery/recovery-source-address.js";
import { PERMISSION_KEYS, type PermissionKey } from "../roles/permission-catalog.js";
import { recordBackofficeRequest } from "./backoffice-request-rate-limiter.js";
import { readSessionCookie } from "./session-cookie.js";
import { hashSessionId } from "./session-id.js";

/** A session with no use in this long is no longer valid, even if it's well within its absolute limit. */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** A session this old is no longer valid, no matter how recently it was used. */
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export const UNAUTHENTICATED_RESPONSE = {
  code: "unauthenticated",
  message: "no session is signed in",
} as const;

export interface OpenSession {
  sessionId: string;
  userId: string;
  firstName: string;
  createdAt: Date;
  lastSeenAt: Date;
  /** The branch (`locations.id`) the signed-in user belongs to (single branch today). */
  locationId: string;
  /** Whether the signed-in user's role has `roles.is_administrator` set. */
  isAdministrator: boolean;
  /**
   * The permission keys the signed-in user's role currently holds, in catalog order. An
   * Administrator holds every catalog key implicitly (its role stores no `role_permissions` rows),
   * and a user with no role yet holds none.
   */
  permissionKeys: readonly PermissionKey[];
}

/** Reads one role's currently granted permission keys, in catalog order, fresh on every call. */
async function loadRolePermissionKeys<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  roleId: string,
): Promise<PermissionKey[]> {
  const grantedRows = await db
    .select({ permissionKey: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));
  const granted = new Set(grantedRows.map((row) => row.permissionKey));
  return PERMISSION_KEYS.filter((key) => granted.has(key));
}

/** The earliest deadline the session hits: idle timeout from its last use, or absolute timeout from its creation. */
export function sessionExpiresAt(session: Pick<OpenSession, "createdAt" | "lastSeenAt">): Date {
  const idleDeadline = session.lastSeenAt.getTime() + SESSION_IDLE_TIMEOUT_MS;
  const absoluteDeadline = session.createdAt.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS;
  return new Date(Math.min(idleDeadline, absoluteDeadline));
}

export interface BackofficeSessionCheckOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  now: Date;
}

type SessionLookup =
  | { state: "absent" }
  | { state: "ended"; sessionIdHash: string }
  | { state: "open"; sessionIdHash: string; session: OpenSession };

/**
 * Reads the session cookie on `request` without changing anything: `open` for a live session,
 * `ended` for a row past its idle (30 minutes without use) or absolute (12 hours since creation)
 * expiry or whose account was deactivated, and `absent` for a missing, unknown, or already-revoked
 * cookie.
 */
async function lookUpSession<TQueryResult extends PgQueryResultHKT>(
  request: FastifyRequest,
  options: BackofficeSessionCheckOptions<TQueryResult>,
): Promise<SessionLookup> {
  const rawSessionId = readSessionCookie(request.headers.cookie);
  if (!rawSessionId) {
    return { state: "absent" };
  }
  const sessionIdHash = hashSessionId(rawSessionId);

  const [session] = await options.db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      revokedAt: sessions.revokedAt,
      firstName: users.firstName,
      active: users.active,
      locationId: users.locationId,
      // Left-joined: a user with no `user_roles` row yet (some existing tests seed one that way)
      // resolves to "not an Administrator" rather than making the session unresolvable.
      isAdministrator: roles.isAdministrator,
      roleId: roles.id,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(sessions.sessionIdHash, sessionIdHash))
    .limit(1);
  if (!session || session.revokedAt) {
    return { state: "absent" };
  }

  const currentTime = options.now;
  const idleExpired =
    session.lastSeenAt.getTime() + SESSION_IDLE_TIMEOUT_MS <= currentTime.getTime();
  const absoluteExpired =
    session.createdAt.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS <= currentTime.getTime();
  // A deactivated account's session ends immediately (drafts/docs/puro-sur-pos.md §12.3,
  // CA-ACC-19), the same rule that keeps its passkey from opening a new one at sign-in.
  if (idleExpired || absoluteExpired || !session.active) {
    return { state: "ended", sessionIdHash };
  }

  const isAdministrator = session.isAdministrator ?? false;
  const permissionKeys = isAdministrator
    ? [...PERMISSION_KEYS]
    : session.roleId
      ? await loadRolePermissionKeys(options.db, session.roleId)
      : [];

  return {
    state: "open",
    sessionIdHash,
    session: {
      sessionId: session.id,
      userId: session.userId,
      firstName: session.firstName,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      locationId: session.locationId,
      isAdministrator,
      permissionKeys,
    },
  };
}

const RATE_LIMITED_RESPONSE_CODE = "rate_limited";

export type BackofficeSessionCheck = SessionLookup | { state: "rate_limited" };

/**
 * Reads the session cookie on `request` once and, only when that read finds an open session,
 * counts the request against the backoffice API rate limiter, keyed by the session's row id and by
 * the request's source address. The single read decides both whether the request counts and how
 * the caller proceeds, so a request is never counted as one state and served as another. Changes
 * nothing else: on rejection it sends 429 `rate_limited` with `Retry-After` and returns
 * `rate_limited`, touching no session; otherwise it returns the lookup (`absent`, `ended`, or an
 * admitted `open`) for the caller to act on. A request with no open session is not counted.
 */
export async function checkBackofficeSession<TQueryResult extends PgQueryResultHKT>(
  request: FastifyRequest,
  reply: FastifyReply,
  options: BackofficeSessionCheckOptions<TQueryResult>,
): Promise<BackofficeSessionCheck> {
  const lookup = await lookUpSession(request, options);
  if (lookup.state !== "open") {
    return lookup;
  }

  const result = await recordBackofficeRequest(options.db, {
    sessionKeyValue: lookup.session.sessionId,
    sourceAddress: resolveSourceAddress(request),
    now: options.now,
  });
  if (result.allowed) {
    return lookup;
  }

  await reply
    .header("Retry-After", String(result.retryAfterSeconds))
    .code(429)
    .send({ code: RATE_LIMITED_RESPONSE_CODE, message: "too many backoffice API requests" });
  return { state: "rate_limited" };
}

/**
 * Resolves an open, still-live session for a backoffice route, from the single read
 * `checkBackofficeSession` makes, without touching `last_seen_at`. Otherwise the reply is already
 * sent and it returns `undefined`: 429 when the request is over its limits, or 401
 * `unauthenticated` when the cookie is missing, unknown, revoked, expired (30 minutes idle or 12
 * hours since creation), or belongs to a deactivated account, revoking an ended session's row
 * instead of leaving it dangling.
 */
async function resolveOpenSession<TQueryResult extends PgQueryResultHKT>(
  request: FastifyRequest,
  reply: FastifyReply,
  options: BackofficeSessionCheckOptions<TQueryResult>,
): Promise<{ sessionIdHash: string; session: OpenSession } | undefined> {
  const check = await checkBackofficeSession(request, reply, options);
  if (check.state === "rate_limited") {
    return undefined;
  }
  if (check.state === "ended") {
    await options.db
      .update(sessions)
      .set({ revokedAt: options.now })
      .where(eq(sessions.sessionIdHash, check.sessionIdHash));
  }
  if (check.state !== "open") {
    await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
    return undefined;
  }

  return { sessionIdHash: check.sessionIdHash, session: check.session };
}

/**
 * Requires an open, still-live session for a backoffice route: touches `last_seen_at` on an
 * admitted open session and returns the signed-in user's identity (with `lastSeenAt` reflecting
 * that touch). See `resolveOpenSession` for how the session is resolved and what ends a request
 * early.
 */
export async function requireOpenSession<TQueryResult extends PgQueryResultHKT>(
  request: FastifyRequest,
  reply: FastifyReply,
  options: BackofficeSessionCheckOptions<TQueryResult>,
): Promise<OpenSession | undefined> {
  const resolved = await resolveOpenSession(request, reply, options);
  if (!resolved) {
    return undefined;
  }

  await options.db
    .update(sessions)
    .set({ lastSeenAt: options.now })
    .where(eq(sessions.sessionIdHash, resolved.sessionIdHash));

  return { ...resolved.session, lastSeenAt: options.now };
}

/**
 * Looks up an open, still-live session for a backoffice route without touching `last_seen_at`, so
 * a caller can report the session's status without keeping an idle tab alive. See
 * `resolveOpenSession` for how the session is resolved and what ends a request early.
 */
export async function peekOpenSession<TQueryResult extends PgQueryResultHKT>(
  request: FastifyRequest,
  reply: FastifyReply,
  options: BackofficeSessionCheckOptions<TQueryResult>,
): Promise<OpenSession | undefined> {
  const resolved = await resolveOpenSession(request, reply, options);
  return resolved?.session;
}

function rejectAsCrossSite(reply: FastifyReply, message: string): false {
  void reply.code(403).send({ code: "origin_rejected", message });
  return false;
}

/**
 * Answers whether this request is the backoffice's own, from the two headers a browser sets
 * itself and a page cannot forge. Both are trusted when present and neither is treated as proof
 * when absent: `Origin` alone cannot decide it here, since these are GETs (which carry no `Origin`
 * for a same-origin request), and `Sec-Fetch-Site` is what separates the backoffice's own fetch
 * (`same-origin`) from a cross-site top-level navigation (`cross-site`) — which `SameSite=Lax`
 * still hands the session cookie — and from someone opening the URL themselves (`none`). Shared by
 * every open-session GET route, since each one writes `last_seen_at` (or revokes a row) through
 * `requireOpenSession` above and none of that may happen for a request the browser already said
 * did not come from the backoffice.
 *
 * Known limitation: a request carrying neither header still reaches that write path. A browser
 * old enough to send no Fetch Metadata at all would be turned away from the backoffice itself by
 * a third guard, and the backoffice is a desktop application on a current browser.
 */
export function checkRequestIsSameOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
  backofficeOrigin: string,
): boolean {
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== backofficeOrigin) {
    return rejectAsCrossSite(
      reply,
      "the request's Origin does not match the backoffice's own origin",
    );
  }

  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite !== undefined && fetchSite !== "same-origin") {
    return rejectAsCrossSite(reply, "the request did not come from the backoffice itself");
  }

  return true;
}
