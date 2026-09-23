import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sessions } from "../db/schema.js";
import { checkBackofficeSession } from "./open-session.js";
import { clearSessionCookie, readSessionCookie } from "./session-cookie.js";
import { hashSessionId } from "./session-id.js";

export interface SessionSignOutRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so the revoked-at timestamp is deterministic. */
  now?: () => Date;
}

const UNAUTHENTICATED_RESPONSE = {
  code: "unauthenticated",
  message: "no session is signed in",
} as const;

/**
 * Registers `POST /users/session/sign-out`: requires the session cookie, revokes that session,
 * and clears the cookie. Revoking only a still-live row (`revokedAt is null`) makes a repeated
 * call idempotent, and a cookie whose session is already gone or unknown still succeeds and still
 * clears the cookie, since there is nothing left to sign out of.
 */
export function registerSessionSignOutRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionSignOutRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

  function checkOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
    if (request.headers.origin !== options.backofficeOrigin) {
      void reply.code(403).send({
        code: "origin_rejected",
        message: "the request's Origin does not match the backoffice's own origin",
      });
      return false;
    }
    return true;
  }

  app.post("/users/session/sign-out", async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    const rawSessionId = readSessionCookie(request.headers.cookie);
    if (!rawSessionId) {
      await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
      return;
    }
    const check = await checkBackofficeSession(request, reply, { db: options.db, now: now() });
    if (check.state === "rate_limited") {
      return;
    }

    await options.db
      .update(sessions)
      .set({ revokedAt: now() })
      .where(
        and(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)), isNull(sessions.revokedAt)),
      );

    await reply.header("Set-Cookie", clearSessionCookie()).code(200).send();
  });
}
