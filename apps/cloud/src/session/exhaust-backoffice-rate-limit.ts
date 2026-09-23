import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { backofficeRateLimitAttempts } from "../db/schema.js";
import { BACKOFFICE_SESSION_LIMIT_PER_HOUR } from "./backoffice-request-rate-limiter.js";
import { hashSessionId } from "./session-id.js";

/** Fills a session's own backoffice request limit with requests made at `at`, for route tests. */
export async function exhaustSessionRateLimit<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  rawSessionId: string,
  at: Date,
): Promise<void> {
  await db.insert(backofficeRateLimitAttempts).values(
    Array.from({ length: BACKOFFICE_SESSION_LIMIT_PER_HOUR }, () => ({
      keyKind: "session" as const,
      keyValue: hashSessionId(rawSessionId),
      attemptedAt: at,
    })),
  );
}
