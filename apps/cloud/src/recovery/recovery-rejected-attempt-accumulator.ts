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

export function windowStartFor(now: Date): Date {
  return new Date(Math.floor(now.getTime() / RECOVERY_WINDOW_MS) * RECOVERY_WINDOW_MS);
}

/** One row per (kind, key, hour): identical work whether or not the key resolves to a real
 * account, so a flood of rejections never costs more than one upsert each. */
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
