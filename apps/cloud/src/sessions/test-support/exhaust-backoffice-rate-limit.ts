import {
  BACKOFFICE_SESSION_REQUEST_LIMIT,
  BACKOFFICE_SOURCE_ADDRESS_REQUEST_LIMIT,
} from "@purosur/domain";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { backofficeRateLimitAttempts, sessions } from "../../platform/db/schema.js";
import { hashSessionId } from "../session-id.js";

/** The source address Fastify's `inject` reports for every test request. */
export const INJECTED_SOURCE_ADDRESS = "127.0.0.1";

async function seedAttempts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  keyKind: "session" | "source_address",
  keyValue: string,
  count: number,
  at: Date,
): Promise<void> {
  await db.execute(sql`
    insert into ${backofficeRateLimitAttempts} (key_kind, key_value, attempted_at)
    select ${keyKind}, ${keyValue}, ${at.toISOString()}::timestamptz from generate_series(1, ${count})
  `);
}

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
  await seedAttempts(db, "session", session.id, BACKOFFICE_SESSION_REQUEST_LIMIT, at);
}

export async function exhaustSourceAddressRateLimit<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  sourceAddress: string,
  at: Date,
): Promise<void> {
  await seedAttempts(
    db,
    "source_address",
    sourceAddress,
    BACKOFFICE_SOURCE_ADDRESS_REQUEST_LIMIT,
    at,
  );
}
