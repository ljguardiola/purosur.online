import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sessions, users } from "../db/schema.js";
import { readSessionCookie } from "./session-cookie.js";
import { hashSessionId } from "./session-id.js";

export interface SessionReadRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

/** A session with no use in this long is no longer valid, even if it's well within its absolute limit. */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** A session this old is no longer valid, no matter how recently it was used. */
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

const UNAUTHENTICATED_RESPONSE = {
  code: "unauthenticated",
  message: "no session is signed in",
} as const;

/**
 * Registers `GET /users/session`: resolves the session cookie, enforces idle (30 minutes without
 * use) and absolute (12 hours since creation) expiry, touches `last_seen_at` on a live session,
 * and returns the signed-in user's identity for the shell to render. Answers 401 `unauthenticated`
 * when the cookie is missing, unknown, revoked, expired, or belongs to a deactivated account, and
 * revokes that session's row instead of leaving it dangling.
 */
export function registerSessionReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionReadRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

  function rejectAsCrossSite(reply: FastifyReply, message: string): false {
    void reply.code(403).send({ code: "origin_rejected", message });
    return false;
  }

  /**
   * Answers whether this request is the backoffice's own, from the two headers a browser sets
   * itself and a page cannot forge. Both are trusted when present and neither is treated as proof
   * when absent, which is the same posture the other three `/users/session/*` routes take.
   *
   * `Origin` alone cannot decide it here: those three are POSTs, which always carry one, while a
   * same-origin GET carries none. `Sec-Fetch-Site` is what separates the backoffice's own fetch
   * (`same-origin`) from a cross-site top-level navigation (`cross-site`) — which `SameSite=Lax`
   * still hands the session cookie — and from someone opening the URL themselves (`none`). This
   * route writes `last_seen_at` and can revoke a row, so none of that may happen for a request
   * the browser already said did not come from the backoffice.
   */
  function checkRequestIsSameOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== options.backofficeOrigin) {
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

  app.get("/users/session", async (request, reply) => {
    if (!checkRequestIsSameOrigin(request, reply)) {
      return;
    }

    const rawSessionId = readSessionCookie(request.headers.cookie);
    if (!rawSessionId) {
      await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
      return;
    }
    const sessionIdHash = hashSessionId(rawSessionId);

    const [session] = await options.db
      .select({
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
      await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
      return;
    }

    const currentTime = now();
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
      await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
      return;
    }

    await options.db
      .update(sessions)
      .set({ lastSeenAt: currentTime })
      .where(eq(sessions.sessionIdHash, sessionIdHash));

    await reply.code(200).send({ user_id: session.userId, display_name: session.firstName });
  });
}
