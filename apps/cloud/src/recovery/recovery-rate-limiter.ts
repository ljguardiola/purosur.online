import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { recoveryRateLimitCounters } from "../db/schema.js";

const DESTINATION_ADDRESS_LIMIT_PER_HOUR = 5;
const SOURCE_ADDRESS_LIMIT_PER_HOUR = 10;

export interface RecoveryRateLimitInput {
  destinationAddress: string;
  sourceAddress: string;
  now: Date;
}

export interface RecoveryRateLimitResult {
  allowed: boolean;
}

function hourWindowStart(now: Date): Date {
  const windowStart = new Date(now);
  windowStart.setUTCMinutes(0, 0, 0);
  return windowStart;
}

async function incrementCounter<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  keyKind: "destination_address" | "source_address",
  keyValue: string,
  windowStart: Date,
): Promise<number> {
  const [row] = await db
    .insert(recoveryRateLimitCounters)
    .values({ keyKind, keyValue, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [
        recoveryRateLimitCounters.keyKind,
        recoveryRateLimitCounters.keyValue,
        recoveryRateLimitCounters.windowStart,
      ],
      set: { count: sql`${recoveryRateLimitCounters.count} + 1` },
    })
    .returning({ count: recoveryRateLimitCounters.count });
  if (!row) {
    throw new Error("incrementing the recovery rate limit counter returned no row");
  }
  return row.count;
}

/**
 * Records one recovery-request attempt against both the destination account's address and the
 * source address it came from, in the same fixed hourly window, and reports whether either limit
 * (5/h per destination, 10/h per source) was exceeded. Always increments both counters, whether
 * or not the destination address belongs to a real account, so the outcome never depends on the
 * account's existence.
 */
export async function recordRecoveryRequestAttempt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: RecoveryRateLimitInput,
): Promise<RecoveryRateLimitResult> {
  const windowStart = hourWindowStart(input.now);

  const [destinationCount, sourceCount] = await Promise.all([
    incrementCounter(db, "destination_address", input.destinationAddress, windowStart),
    incrementCounter(db, "source_address", input.sourceAddress, windowStart),
  ]);

  return {
    allowed:
      destinationCount <= DESTINATION_ADDRESS_LIMIT_PER_HOUR &&
      sourceCount <= SOURCE_ADDRESS_LIMIT_PER_HOUR,
  };
}
