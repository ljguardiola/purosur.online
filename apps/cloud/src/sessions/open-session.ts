import {
  endExpiredSession,
  findOpenSession,
  type OpenSession,
  recordSessionActivity,
} from "@purosur/domain/sessions/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveSourceAddress } from "../platform/source-address.js";
import { recordBackofficeRequest } from "./backoffice-request-rate-limiter.js";
import { drizzleSessionStore } from "./drizzle-session-store.js";
import { drizzleSessions } from "./drizzle-sessions.js";
import { readSessionCookie } from "./session-cookie.js";
import { hashSessionId } from "./session-id.js";

export const UNAUTHENTICATED_RESPONSE = {
  code: "unauthenticated",
  message: "no session is signed in",
} as const;

export type { OpenSession };

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

  const found = await findOpenSession(
    { sessions: drizzleSessions(options.db) },
    { sessionKey: sessionIdHash, now: options.now },
  );
  switch (found.kind) {
    case "absent":
      return { state: "absent" };
    case "ended":
      return { state: "ended", sessionIdHash };
    case "open":
      return { state: "open", sessionIdHash, session: found.session };
  }
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
    await endExpiredSession(
      { store: drizzleSessionStore(options.db) },
      { sessionKey: check.sessionIdHash, at: options.now },
    );
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

  await recordSessionActivity(
    { store: drizzleSessionStore(options.db) },
    { sessionKey: resolved.sessionIdHash, at: options.now },
  );

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

export async function readCurrentOpenSession<TQueryResult extends PgQueryResultHKT>(
  request: FastifyRequest,
  options: BackofficeSessionCheckOptions<TQueryResult>,
): Promise<OpenSession | undefined> {
  const lookup = await lookUpSession(request, options);
  return lookup.state === "open" ? lookup.session : undefined;
}
