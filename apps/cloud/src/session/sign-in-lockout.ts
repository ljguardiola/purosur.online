import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { signInFailures, signInLockouts } from "../db/schema.js";

/** The rolling window `sign_in_failures` counts a source address's failed attempts over. */
export const SIGN_IN_LOCKOUT_WINDOW_MS = 60 * 60 * 1000;
/** A source address reaching this many failed attempts within the window earns a block. */
export const SIGN_IN_FAILURE_LIMIT = 10;
/** How long a tripped block lasts, counted from the attempt that tripped it. */
export const SIGN_IN_BLOCK_DURATION_MS = 15 * 60 * 1000;
const PRUNE_BATCH_SIZE = 100;

export type SignInLockoutStatus = { blocked: true; blockedUntil: Date } | { blocked: false };

export interface RecordSignInFailureInput {
  sourceAddress: string;
  now: Date;
}

export interface TrippedSignInLockout {
  id: string;
  blockedUntil: Date;
  failureCount: number;
}

export type RecordSignInFailureResult =
  | { tripped: true; lockout: TrippedSignInLockout }
  | { tripped: false };

/**
 * Hashes a source address for the audit log the same way #167 hashes its own rate-limit keys
 * (SHA-256, hex-encoded): the lockout tables themselves key by the raw address (never looked up by
 * anything else), but a permanent audit row never stores it in the clear.
 */
export function hashSourceAddress(sourceAddress: string): string {
  return createHash("sha256").update(sourceAddress).digest("hex");
}

/** Reports whether a source address is currently within its 15-minute block, if any. */
export async function checkSignInLockout<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  sourceAddress: string,
  now: Date,
): Promise<SignInLockoutStatus> {
  const [lockout] = await db
    .select({ blockedUntil: signInLockouts.blockedUntil })
    .from(signInLockouts)
    .where(eq(signInLockouts.sourceAddress, sourceAddress))
    .limit(1);
  if (lockout && lockout.blockedUntil.getTime() > now.getTime()) {
    return { blocked: true, blockedUntil: lockout.blockedUntil };
  }
  return { blocked: false };
}

async function pruneExpiredFailures<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  windowStart: Date,
): Promise<void> {
  const expired = db
    .select({ id: signInFailures.id })
    .from(signInFailures)
    .where(lte(signInFailures.attemptedAt, windowStart))
    .limit(PRUNE_BATCH_SIZE)
    .for("update", { skipLocked: true });
  await db.delete(signInFailures).where(inArray(signInFailures.id, expired));
}

/**
 * Records one server-rejected sign-in attempt against its source address and reports whether this
 * attempt is the one that reaches the rolling one-hour limit. On the failure that reaches it, sets
 * (or extends) that address's 15-minute block. A source address is locked for the whole
 * transaction, so concurrent failures from the same address can never both trip the lockout.
 */
export async function recordSignInFailure<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: RecordSignInFailureInput,
): Promise<RecordSignInFailureResult> {
  const windowStart = new Date(input.now.getTime() - SIGN_IN_LOCKOUT_WINDOW_MS);
  await pruneExpiredFailures(db, windowStart);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.sourceAddress}, 0))`,
    );

    await tx.insert(signInFailures).values({
      sourceAddress: input.sourceAddress,
      attemptedAt: input.now,
    });

    const counted = await tx
      .select({ attemptedAt: signInFailures.attemptedAt })
      .from(signInFailures)
      .where(
        and(
          eq(signInFailures.sourceAddress, input.sourceAddress),
          gt(signInFailures.attemptedAt, windowStart),
        ),
      )
      .orderBy(desc(signInFailures.attemptedAt));
    const failureCount = counted.length;

    if (failureCount < SIGN_IN_FAILURE_LIMIT) {
      return { tripped: false } as const;
    }

    const blockedUntil = new Date(input.now.getTime() + SIGN_IN_BLOCK_DURATION_MS);
    const [lockout] = await tx
      .insert(signInLockouts)
      .values({ sourceAddress: input.sourceAddress, blockedUntil })
      .onConflictDoUpdate({
        target: signInLockouts.sourceAddress,
        set: { blockedUntil },
      })
      .returning({ id: signInLockouts.id });
    if (!lockout) {
      throw new Error("sign-in lockout upsert returned no row");
    }

    return { tripped: true, lockout: { id: lockout.id, blockedUntil, failureCount } } as const;
  });
}
