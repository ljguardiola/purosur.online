import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { backofficeRateLimitAttempts, sessions } from "../db/schema.js";
import {
  BACKOFFICE_SESSION_LIMIT_PER_HOUR,
  BACKOFFICE_SOURCE_ADDRESS_LIMIT_PER_HOUR,
} from "./backoffice-request-rate-limiter.js";
import { hashSessionId } from "./session-id.js";

/** The source address Fastify's `inject` reports for every test request. */
export const INJECTED_SOURCE_ADDRESS = "127.0.0.1";

/** Fills a session's own backoffice request limit with requests made at `at`, for route tests. */
export async function exhaustSessionRateLimit<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  rawSessionId: string,
  at: Date,
): Promise<void> {
  const [session] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
  if (!session) {
    throw new Error("test setup: no session row for this cookie");
  }
  await db.insert(backofficeRateLimitAttempts).values(
    Array.from({ length: BACKOFFICE_SESSION_LIMIT_PER_HOUR }, () => ({
      keyKind: "session" as const,
      keyValue: session.id,
      attemptedAt: at,
    })),
  );
}

/** Fills a source address's backoffice request limit with requests made at `at`, for route tests. */
export async function exhaustSourceAddressRateLimit<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  sourceAddress: string,
  at: Date,
): Promise<void> {
  await db.insert(backofficeRateLimitAttempts).values(
    Array.from({ length: BACKOFFICE_SOURCE_ADDRESS_LIMIT_PER_HOUR }, () => ({
      keyKind: "source_address" as const,
      keyValue: sourceAddress,
      attemptedAt: at,
    })),
  );
}
