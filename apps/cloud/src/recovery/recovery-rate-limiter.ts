import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { recoveryRateLimitAttempts } from "../db/schema.js";

const WINDOW_MS = 60 * 60 * 1000;
const DESTINATION_ADDRESS_LIMIT_PER_HOUR = 5;
const SOURCE_ADDRESS_LIMIT_PER_HOUR = 10;
// Not specified by the issue or the doc (T2 technical decision, see feature document): the same
// tope-por-origen budget as the request endpoint's source-address limit, shared by both
// `registration-options` and `redeem` so probing either one counts against it.
const REDEMPTION_SOURCE_ADDRESS_LIMIT_PER_HOUR = 10;
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

function hashDestinationAddress(normalizedAddress: string): string {
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

/**
 * Admits an attempt only when every key has fewer than its limit of attempts in the last 60
 * minutes, and records it against every key in that case. A rejected attempt records nothing, so
 * the reported wait is exactly when the oldest counted attempt leaves the window. Each key is
 * locked for the transaction, so concurrent attempts can never both take the last slot.
 */
async function recordAttempt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  keys: RateLimitedKey[],
  now: Date,
): Promise<RecoveryRateLimitResult> {
  const windowStart = new Date(now.getTime() - WINDOW_MS);
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
        const slotFreesAt = oldestCounted.attemptedAt.getTime() + WINDOW_MS;
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

/**
 * Records one recovery-request attempt against both the destination account's address (stored
 * only as its SHA-256 hash) and the source address it came from, and reports whether either
 * rolling one-hour limit (5 per destination, 10 per source) was already reached. Checks both
 * whether or not the destination address belongs to a real account, so the outcome never
 * depends on the account's existence.
 */
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
        limit: DESTINATION_ADDRESS_LIMIT_PER_HOUR,
      },
      {
        keyKind: "source_address",
        keyValue: input.sourceAddress,
        limit: SOURCE_ADDRESS_LIMIT_PER_HOUR,
      },
    ],
    input.now,
  );
}

/**
 * Records one attempt against `POST /users/recovery/registration-options` or `POST
 * /users/recovery/redeem` and reports whether the shared per-source-address redemption budget
 * (10 in any rolling hour) was already reached. Kept as its own key kind so probing the redeem
 * side never affects, or is affected by, the request endpoint's own source-address limit.
 */
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
        limit: REDEMPTION_SOURCE_ADDRESS_LIMIT_PER_HOUR,
      },
    ],
    input.now,
  );
}
