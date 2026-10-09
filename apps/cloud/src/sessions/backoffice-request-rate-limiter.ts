import {
  BACKOFFICE_REQUEST_WINDOW_MS,
  BACKOFFICE_SESSION_REQUEST_LIMIT,
  BACKOFFICE_SOURCE_ADDRESS_REQUEST_LIMIT,
  backofficeRequestWindowStart,
} from "@purosur/domain";
import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { backofficeRateLimitAttempts } from "../platform/db/schema.js";

const PRUNE_BATCH_SIZE = 100;

export interface BackofficeRateLimitInput {
  sessionKeyValue: string;
  sourceAddress: string;
  now: Date;
}

export type BackofficeRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type BackofficeRateLimitKeyKind = "session" | "source_address";

interface RateLimitedKey {
  keyKind: BackofficeRateLimitKeyKind;
  keyValue: string;
  limit: number;
}

async function pruneExpiredAttempts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  windowStart: Date,
): Promise<void> {
  const expired = db
    .select({ id: backofficeRateLimitAttempts.id })
    .from(backofficeRateLimitAttempts)
    .where(lte(backofficeRateLimitAttempts.attemptedAt, windowStart))
    .limit(PRUNE_BATCH_SIZE)
    .for("update", { skipLocked: true });
  await db
    .delete(backofficeRateLimitAttempts)
    .where(inArray(backofficeRateLimitAttempts.id, expired));
}

/** Each key is locked for the transaction, so concurrent requests can never both take the last slot. */
export async function recordBackofficeRequest<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: BackofficeRateLimitInput,
): Promise<BackofficeRateLimitResult> {
  const keys: RateLimitedKey[] = [
    {
      keyKind: "session",
      keyValue: input.sessionKeyValue,
      limit: BACKOFFICE_SESSION_REQUEST_LIMIT,
    },
    {
      keyKind: "source_address",
      keyValue: input.sourceAddress,
      limit: BACKOFFICE_SOURCE_ADDRESS_REQUEST_LIMIT,
    },
  ];

  const now = input.now;
  const windowStart = backofficeRequestWindowStart(now);
  await pruneExpiredAttempts(db, windowStart);

  return db.transaction(async (tx) => {
    // Prefixed so this limiter never waits on the recovery limiter's lock for the same address.
    const lockOrder = keys.map((key) => `backoffice:${key.keyKind}:${key.keyValue}`).sort();
    for (const lockKey of lockOrder) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    }

    let retryAfterMs = 0;
    for (const key of keys) {
      const [oldestCounted] = await tx
        .select({ attemptedAt: backofficeRateLimitAttempts.attemptedAt })
        .from(backofficeRateLimitAttempts)
        .where(
          and(
            eq(backofficeRateLimitAttempts.keyKind, key.keyKind),
            eq(backofficeRateLimitAttempts.keyValue, key.keyValue),
            gt(backofficeRateLimitAttempts.attemptedAt, windowStart),
          ),
        )
        .orderBy(desc(backofficeRateLimitAttempts.attemptedAt))
        .offset(key.limit - 1)
        .limit(1);
      if (oldestCounted) {
        const slotFreesAt = oldestCounted.attemptedAt.getTime() + BACKOFFICE_REQUEST_WINDOW_MS;
        retryAfterMs = Math.max(retryAfterMs, slotFreesAt - now.getTime());
      }
    }
    if (retryAfterMs > 0) {
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) } as const;
    }

    await tx
      .insert(backofficeRateLimitAttempts)
      .values(
        keys.map((key) => ({ keyKind: key.keyKind, keyValue: key.keyValue, attemptedAt: now })),
      );
    return { allowed: true } as const;
  });
}
