import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { recoveryRateLimitCounters } from "../db/schema.js";

const DESTINATION_ADDRESS_LIMIT_PER_HOUR = 5;
const SOURCE_ADDRESS_LIMIT_PER_HOUR = 10;
// Not specified by the issue or the doc (T2 technical decision, see feature document): the same
// tope-por-origen budget as the request endpoint's source-address limit, shared by both
// `registration-options` and `redeem` so probing either one counts against it.
const REDEMPTION_SOURCE_ADDRESS_LIMIT_PER_HOUR = 10;

export interface RecoveryRateLimitInput {
  destinationAddress: string;
  sourceAddress: string;
  now: Date;
}

export interface RedemptionRateLimitInput {
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

type RecoveryRateLimitKeyKind =
  | "destination_address"
  | "source_address"
  | "redemption_source_address";

async function incrementCounter<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  keyKind: RecoveryRateLimitKeyKind,
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

/**
 * Records one attempt against `POST /users/recovery/registration-options` or `POST
 * /users/recovery/redeem` and reports whether the shared per-source-address redemption budget
 * (10/h) was exceeded. Kept as its own counter kind so probing the redeem side never affects, or
 * is affected by, the request endpoint's own source-address limit.
 */
export async function recordRedemptionAttempt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: RedemptionRateLimitInput,
): Promise<RecoveryRateLimitResult> {
  const windowStart = hourWindowStart(input.now);

  const count = await incrementCounter(
    db,
    "redemption_source_address",
    input.sourceAddress,
    windowStart,
  );

  return { allowed: count <= REDEMPTION_SOURCE_ADDRESS_LIMIT_PER_HOUR };
}
