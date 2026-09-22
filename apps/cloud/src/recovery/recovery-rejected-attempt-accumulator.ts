import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  recoveryRejectedAttemptAccumulator,
  type recoveryRejectedAttemptKind,
} from "../db/schema.js";
import { RECOVERY_WINDOW_MS } from "./recovery-rate-limiter.js";

export type RecoveryRejectedAttemptKind = (typeof recoveryRejectedAttemptKind.enumValues)[number];

export interface RecordRejectedAttemptInput {
  kind: RecoveryRejectedAttemptKind;
  /** Already hashed by the caller: the destination-address hash for `request`, the recovery
   * token's own stored hash for `registration_options`/`redeem`. */
  keyHash: string;
  now: Date;
}

/** Floors a timestamp to the start of its hour, the accumulator's grouping window. */
export function windowStartFor(now: Date): Date {
  return new Date(Math.floor(now.getTime() / RECOVERY_WINDOW_MS) * RECOVERY_WINDOW_MS);
}

/**
 * Records one rejected request or redemption attempt against issue #167's grouped-audit
 * accumulator: a single synchronous upsert, identical work whether or not the key resolves to a
 * real account, so a flood of rejections never costs more than one row per (kind, key, hour). The
 * row's `count` grows with each attempt, and `first_at`/`last_at` keep the earliest and latest
 * attempt time whatever order concurrent attempts land in. A `recovery-rejected-attempt-flush.ts`
 * cron task later turns closed windows into audit rows and deletes the accumulator rows it flushed.
 */
export async function recordRejectedAttempt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: RecordRejectedAttemptInput,
): Promise<void> {
  const windowStart = windowStartFor(input.now);

  await db
    .insert(recoveryRejectedAttemptAccumulator)
    .values({
      kind: input.kind,
      keyHash: input.keyHash,
      windowStart,
      count: 1,
      firstAt: input.now,
      lastAt: input.now,
    })
    .onConflictDoUpdate({
      target: [
        recoveryRejectedAttemptAccumulator.kind,
        recoveryRejectedAttemptAccumulator.keyHash,
        recoveryRejectedAttemptAccumulator.windowStart,
      ],
      set: {
        count: sql`${recoveryRejectedAttemptAccumulator.count} + 1`,
        firstAt: sql`least(${recoveryRejectedAttemptAccumulator.firstAt}, excluded.first_at)`,
        lastAt: sql`greatest(${recoveryRejectedAttemptAccumulator.lastAt}, excluded.last_at)`,
      },
    });
}
