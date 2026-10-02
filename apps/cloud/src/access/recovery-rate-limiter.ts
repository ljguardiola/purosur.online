import { createHash } from "node:crypto";
import {
  RECOVERY_DESTINATION_ADDRESS_LIMIT,
  RECOVERY_RATE_LIMIT_WINDOW_MS,
  RECOVERY_REDEMPTION_SOURCE_ADDRESS_LIMIT,
  RECOVERY_SOURCE_ADDRESS_LIMIT,
  recoveryRateLimitWindowStart,
} from "@purosur/domain";
import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { recoveryRateLimitAttempts } from "../platform/db/schema.js";

const PRUNE_BATCH_SIZE = 100;

export interface RecoveryRateLimitInput {
  destinationAddress: string;
  sourceAddress: string;
  now: Date;
}

export interface RedemptionRateLimitInput {
  sourceAddress: string;
  now: Date;
}

export type RecoveryRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type RecoveryRateLimitKeyKind =
  | "destination_address"
  | "source_address"
  | "redemption_source_address";

interface RateLimitedKey {
  keyKind: RecoveryRateLimitKeyKind;
  keyValue: string;
  limit: number;
}

export function hashDestinationAddress(normalizedAddress: string): string {
  return createHash("sha256").update(normalizedAddress).digest("hex");
}

async function pruneExpiredAttempts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  windowStart: Date,
): Promise<void> {
  // SKIP LOCKED lets concurrent requests prune disjoint batches without waiting on each other.
  const expired = db
    .select({ id: recoveryRateLimitAttempts.id })
    .from(recoveryRateLimitAttempts)
    .where(lte(recoveryRateLimitAttempts.attemptedAt, windowStart))
    .limit(PRUNE_BATCH_SIZE)
    .for("update", { skipLocked: true });
  await db.delete(recoveryRateLimitAttempts).where(inArray(recoveryRateLimitAttempts.id, expired));
}

/** Each key is locked for the transaction, so concurrent attempts can never both take the last slot. */
async function recordAttempt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  keys: RateLimitedKey[],
  now: Date,
): Promise<RecoveryRateLimitResult> {
  const windowStart = recoveryRateLimitWindowStart(now);
  await pruneExpiredAttempts(db, windowStart);

  return db.transaction(async (tx) => {
    const lockOrder = keys.map((key) => `${key.keyKind}:${key.keyValue}`).sort();
    for (const lockKey of lockOrder) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    }

    let retryAfterMs = 0;
    for (const key of keys) {
      const counted = await tx
        .select({ attemptedAt: recoveryRateLimitAttempts.attemptedAt })
        .from(recoveryRateLimitAttempts)
        .where(
          and(
            eq(recoveryRateLimitAttempts.keyKind, key.keyKind),
            eq(recoveryRateLimitAttempts.keyValue, key.keyValue),
            gt(recoveryRateLimitAttempts.attemptedAt, windowStart),
          ),
        )
        .orderBy(desc(recoveryRateLimitAttempts.attemptedAt))
        .limit(key.limit);
      const oldestCounted = counted[key.limit - 1];
      if (oldestCounted) {
        const slotFreesAt = oldestCounted.attemptedAt.getTime() + RECOVERY_RATE_LIMIT_WINDOW_MS;
        retryAfterMs = Math.max(retryAfterMs, slotFreesAt - now.getTime());
      }
    }
    if (retryAfterMs > 0) {
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) } as const;
    }

    await tx
      .insert(recoveryRateLimitAttempts)
      .values(
        keys.map((key) => ({ keyKind: key.keyKind, keyValue: key.keyValue, attemptedAt: now })),
      );
    return { allowed: true } as const;
  });
}

/** Checked regardless of whether the destination address belongs to a real account, so the
 * outcome never reveals account existence. */
export async function recordRecoveryRequestAttempt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: RecoveryRateLimitInput,
): Promise<RecoveryRateLimitResult> {
  return recordAttempt(
    db,
    [
      {
        keyKind: "destination_address",
        keyValue: hashDestinationAddress(input.destinationAddress),
        limit: RECOVERY_DESTINATION_ADDRESS_LIMIT,
      },
      {
        keyKind: "source_address",
        keyValue: input.sourceAddress,
        limit: RECOVERY_SOURCE_ADDRESS_LIMIT,
      },
    ],
    input.now,
  );
}

export async function recordRedemptionAttempt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: RedemptionRateLimitInput,
): Promise<RecoveryRateLimitResult> {
  return recordAttempt(
    db,
    [
      {
        keyKind: "redemption_source_address",
        keyValue: input.sourceAddress,
        limit: RECOVERY_REDEMPTION_SOURCE_ADDRESS_LIMIT,
      },
    ],
    input.now,
  );
}
