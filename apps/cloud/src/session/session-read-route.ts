import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sessions, users } from "../db/schema.js";
import { readSessionCookie } from "./session-cookie.js";
import { hashSessionId } from "./session-id.js";

export interface SessionReadRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
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
 * when the cookie is missing, unknown, revoked, or expired, and revokes an expired session's row
 * instead of leaving it dangling.
 */
export function registerSessionReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionReadRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

  app.get("/users/session", async (request, reply) => {
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
    if (idleExpired || absoluteExpired) {
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
