import { heldPermissionKeys, isSessionExpired, type PermissionKey } from "@purosur/domain";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { rolePermissions, roles, sessions, userRoles, users } from "../platform/db/schema.js";
import { recordBackofficeRequest } from "./backoffice-request-rate-limiter.js";
import { resolveSourceAddress } from "./recovery-source-address.js";
import { readSessionCookie } from "./session-cookie.js";
import { hashSessionId } from "./session-id.js";

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
  locationId: string;
  isAdministrator: boolean;
  passkeyAuthorizedAt: Date | null;
  permissionKeys: readonly PermissionKey[];
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
      isAdministrator: roles.isAdministrator,
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

  if (isSessionExpired(session, options.now) || !session.active) {
    return { state: "ended", sessionIdHash };
  }

  const isAdministrator = session.isAdministrator ?? false;
  const permissionKeys = heldPermissionKeys({
    isAdministrator,
    permissionKeys: session.grantedPermissionKeys,
  });

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

export async function peekOpenSession<TQueryResult extends PgQueryResultHKT>(
  request: FastifyRequest,
  reply: FastifyReply,
  options: BackofficeSessionCheckOptions<TQueryResult>,
): Promise<OpenSession | undefined> {
  const resolved = await resolveOpenSession(request, reply, options);
  return resolved?.session;
}
