import { PERMISSION_KEYS, type PermissionKey } from "@purosur/contracts";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { rolePermissions, roles, sessions, userRoles, users } from "../db/schema.js";
import { resolveSourceAddress } from "../recovery/recovery-source-address.js";
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
  isAdministrator: boolean;
  passkeyAuthorizedAt: Date | null;
  /** An Administrator holds every catalog key implicitly (its role stores no `role_permissions` rows); a user with no role yet holds none. */
  permissionKeys: readonly PermissionKey[];
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
      passkeyAuthorizedAt: sessions.passkeyAuthorizedAt,
      firstName: users.firstName,
      active: users.active,
      locationId: users.locationId,
      // Left-joined: a user with no `user_roles` row yet resolves to "not an Administrator" rather than making the session unresolvable.
      isAdministrator: roles.isAdministrator,
      // Read in this same query, so the role's current permissions cost no extra round trip.
      grantedPermissionKeys: sql<
        string[]
      >`array(select ${rolePermissions.permissionKey} from ${rolePermissions} where ${rolePermissions.roleId} = ${roles.id})`,
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
  // A deactivated account's session ends immediately, the same rule that keeps its passkey from opening a new one at sign-in.
  if (idleExpired || absoluteExpired || !session.active) {
    return { state: "ended", sessionIdHash };
  }

  const isAdministrator = session.isAdministrator ?? false;
  const granted = new Set(session.grantedPermissionKeys);
  const permissionKeys: PermissionKey[] = isAdministrator
    ? [...PERMISSION_KEYS]
    : PERMISSION_KEYS.filter((key) => granted.has(key));

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
      passkeyAuthorizedAt: session.passkeyAuthorizedAt,
    },
  };
}

const RATE_LIMITED_RESPONSE_CODE = "rate_limited";

export type BackofficeSessionCheck = SessionLookup | { state: "rate_limited" };

/** Reads the session cookie once: the same read decides both whether the request counts against the rate limiter and how the caller proceeds. */
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

/** Revokes an ended session's row instead of leaving it dangling; otherwise the reply is already sent and this returns `undefined`. */
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

/** Unlike `requireOpenSession`, never touches `last_seen_at`, so a caller can report status without keeping an idle tab alive. */
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
 * `Origin` alone can't decide this: a same-origin GET carries no `Origin` header at all.
 * `Sec-Fetch-Site` is what separates the backoffice's own fetch (`same-origin`) from a cross-site
 * navigation (`cross-site`, which `SameSite=Lax` still hands the session cookie) and from someone
 * opening the URL themselves (`none`). Both headers are trusted when present, neither is treated
 * as proof when absent.
 *
 * Known limitation: a request carrying neither header still passes. A browser old enough to send
 * no Fetch Metadata at all is a case the backoffice, a desktop application on a current browser,
 * doesn't need to handle here.
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
