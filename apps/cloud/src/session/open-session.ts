import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { sessions, users } from "../db/schema.js";
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
}

export interface ResolveOpenSessionOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  now: Date;
}

/**
 * Resolves the session cookie on `request` to its open, still-live session: enforces idle (30
 * minutes without use) and absolute (12 hours since creation) expiry, touches `last_seen_at` on a
 * live session, and returns the signed-in user's identity. Returns `undefined` when the cookie is
 * missing, unknown, revoked, expired, or belongs to a deactivated account, revoking that session's
 * row instead of leaving it dangling. Shared by every route that requires an already-open session
 * (`GET /users/session` and the passkey self-management routes of issue #169).
 */
export async function resolveOpenSession<TQueryResult extends PgQueryResultHKT>(
  request: FastifyRequest,
  options: ResolveOpenSessionOptions<TQueryResult>,
): Promise<OpenSession | undefined> {
  const rawSessionId = readSessionCookie(request.headers.cookie);
  if (!rawSessionId) {
    return undefined;
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
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.sessionIdHash, sessionIdHash))
    .limit(1);
  if (!session || session.revokedAt) {
    return undefined;
  }

  const currentTime = options.now;
  const idleExpired =
    session.lastSeenAt.getTime() + SESSION_IDLE_TIMEOUT_MS <= currentTime.getTime();
  const absoluteExpired =
    session.createdAt.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS <= currentTime.getTime();
  // A deactivated account's session ends immediately (drafts/docs/puro-sur-pos.md §12.3,
  // CA-ACC-19), the same rule that keeps its passkey from opening a new one at sign-in.
  if (idleExpired || absoluteExpired || !session.active) {
    await options.db
      .update(sessions)
      .set({ revokedAt: currentTime })
      .where(eq(sessions.sessionIdHash, sessionIdHash));
    return undefined;
  }

  await options.db
    .update(sessions)
    .set({ lastSeenAt: currentTime })
    .where(eq(sessions.sessionIdHash, sessionIdHash));

  return { sessionId: session.id, userId: session.userId, firstName: session.firstName };
}

export interface BackofficeRateLimitCheckOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  now: Date;
}

const RATE_LIMITED_RESPONSE_CODE = "rate_limited";

/**
 * Checks the shared backoffice API rate limiter (issue #205) before anything else about this
 * request is resolved (in particular, before `resolveOpenSession`), so a rejected request has no
 * effect: it never touches `last_seen_at`, revokes a session, or changes anything else. Keys by
 * the session cookie's hash, the same hash `sessions.session_id_hash` is looked up by, when the
 * request carries one, and always by its source address; a request with no session cookie counts
 * only against its address. On rejection, sends 429 `rate_limited` with `Retry-After` and returns
 * false so the caller stops; otherwise returns true. Shared by every route that reads the session
 * cookie, whether or not it also calls `resolveOpenSession` itself (e.g. sign-out reads the cookie
 * directly).
 */
export async function checkBackofficeRateLimit<TQueryResult extends PgQueryResultHKT>(
  request: FastifyRequest,
  reply: FastifyReply,
  options: BackofficeRateLimitCheckOptions<TQueryResult>,
): Promise<boolean> {
  const rawSessionId = readSessionCookie(request.headers.cookie);
  const result = await recordBackofficeRequest(options.db, {
    ...(rawSessionId ? { sessionKeyValue: hashSessionId(rawSessionId) } : {}),
    sourceAddress: resolveSourceAddress(request),
    now: options.now,
  });
  if (result.allowed) {
    return true;
  }

  await reply
    .header("Retry-After", String(result.retryAfterSeconds))
    .code(429)
    .send({ code: RATE_LIMITED_RESPONSE_CODE, message: "too many backoffice API requests" });
  return false;
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
 * `resolveOpenSession` above and none of that may happen for a request the browser already said
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
