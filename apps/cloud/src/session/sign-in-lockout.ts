import { createHash } from "node:crypto";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { signInFailures, signInLockouts } from "../db/schema.js";

/** The rolling window `sign_in_failures` counts a source address's failed attempts over. */
export const SIGN_IN_LOCKOUT_WINDOW_MS = 60 * 60 * 1000;
/** A source address reaching this many failed attempts within the window earns a block. */
export const SIGN_IN_FAILURE_LIMIT = 10;
/** How long a tripped block lasts, counted from the attempt that tripped it. */
export const SIGN_IN_BLOCK_DURATION_MS = 15 * 60 * 1000;
const PRUNE_BATCH_SIZE = 100;

export interface SignInAttemptInput {
  sourceAddress: string;
  now: Date;
}

export interface TrippedSignInLockout {
  id: string;
  blockedUntil: Date;
  failureCount: number;
}

export type SignInAttemptAdmission =
  | { admitted: true; attemptId: string }
  | {
      admitted: false;
      blockedUntil: Date;
      /** Set only by the call that set the block, so each block is audited once. */
      trippedLockout: TrippedSignInLockout | null;
    };

export interface ConfirmedSignInRejection {
  /** Set only by the call that set the block, so each block is audited once. */
  trippedLockout: TrippedSignInLockout | null;
}

/**
 * Hashes a source address for the audit log the same way the recovery rate limiter hashes its
 * destination-address key (SHA-256, hex-encoded): the lockout tables themselves key by the raw
 * address (never looked up by anything else), but a permanent audit row never stores it in the
 * clear.
 */
export function hashSourceAddress(sourceAddress: string): string {
  return createHash("sha256").update(sourceAddress).digest("hex");
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

type LockedTransaction = Parameters<Parameters<PgDatabase<PgQueryResultHKT>["transaction"]>[0]>[0];

function lockSourceAddress(tx: LockedTransaction, sourceAddress: string) {
  return tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${sourceAddress}, 0))`);
}

function selectLiveLockout(tx: LockedTransaction, sourceAddress: string) {
  return tx
    .select({ blockedUntil: signInLockouts.blockedUntil })
    .from(signInLockouts)
    .where(eq(signInLockouts.sourceAddress, sourceAddress))
    .limit(1);
}

function countAttemptsInWindow(tx: LockedTransaction, sourceAddress: string, windowStart: Date) {
  return tx
    .select({ id: signInFailures.id })
    .from(signInFailures)
    .where(
      and(
        eq(signInFailures.sourceAddress, sourceAddress),
        gt(signInFailures.attemptedAt, windowStart),
      ),
    );
}

/**
 * Sets the address's 15-minute block and spends the attempts it was built from, so the block lasts
 * the 15 minutes it says it does: the next one needs its own `SIGN_IN_FAILURE_LIMIT` rejected
 * attempts instead of the same ones re-arming it for the rest of the hour.
 */
async function tripLockout(
  tx: LockedTransaction,
  sourceAddress: string,
  now: Date,
  failureCount: number,
): Promise<TrippedSignInLockout> {
  const blockedUntil = new Date(now.getTime() + SIGN_IN_BLOCK_DURATION_MS);
  const [blocked] = await tx
    .insert(signInLockouts)
    .values({ sourceAddress, blockedUntil })
    .onConflictDoUpdate({ target: signInLockouts.sourceAddress, set: { blockedUntil } })
    .returning({ id: signInLockouts.id });
  if (!blocked) {
    throw new Error("sign-in lockout upsert returned no row");
  }
  await tx.delete(signInFailures).where(eq(signInFailures.sourceAddress, sourceAddress));

  return { id: blocked.id, blockedUntil, failureCount };
}

/**
 * Decides whether a source address may attempt to sign in at all, and records the attempt against
 * it in the same locked transaction, the way `recovery-rate-limiter.ts` records before admitting
 * the work it guards. Recording first is what makes the limit bind: an attempt is counted from the
 * moment it is admitted, so concurrent attempts from one address see each other and only
 * `SIGN_IN_FAILURE_LIMIT` of them ever reach credential verification.
 *
 * Only a caller already holding a real authentication attempt may take a slot. A request with
 * nothing to verify must never reach here, so there is never a slot to give back: the recorded
 * attempt stands as a rejected one until `confirmRejectedSignInAttempt` settles it, or
 * `discardSignInAttempt` takes it back for a sign-in that succeeded.
 */
export async function admitSignInAttempt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: SignInAttemptInput,
): Promise<SignInAttemptAdmission> {
  const windowStart = new Date(input.now.getTime() - SIGN_IN_LOCKOUT_WINDOW_MS);
  await pruneExpiredFailures(db, windowStart);

  return db.transaction(async (tx) => {
    await lockSourceAddress(tx, input.sourceAddress);

    const [lockout] = await selectLiveLockout(tx, input.sourceAddress);
    if (lockout && lockout.blockedUntil.getTime() > input.now.getTime()) {
      return {
        admitted: false,
        blockedUntil: lockout.blockedUntil,
        trippedLockout: null,
      } as const;
    }

    // Reaching the limit with no block live means that many attempts are in flight and none has
    // been settled yet: refusing here is what caps a burst from one address at the limit.
    const counted = await countAttemptsInWindow(tx, input.sourceAddress, windowStart);
    if (counted.length >= SIGN_IN_FAILURE_LIMIT) {
      const tripped = await tripLockout(tx, input.sourceAddress, input.now, counted.length);
      return {
        admitted: false,
        blockedUntil: tripped.blockedUntil,
        trippedLockout: tripped,
      } as const;
    }

    const [attempt] = await tx
      .insert(signInFailures)
      .values({ sourceAddress: input.sourceAddress, attemptedAt: input.now })
      .returning({ id: signInFailures.id });
    if (!attempt) {
      throw new Error("sign-in attempt insert returned no row");
    }

    return { admitted: true, attemptId: attempt.id } as const;
  });
}

/**
 * Settles an admitted attempt as the rejected sign-in it turned out to be, and blocks the address
 * when this is the attempt that reaches the limit. The rule blocks an address that *reaches*
 * `SIGN_IN_FAILURE_LIMIT` rejected attempts within the window, so that attempt still gets the
 * uniform rejection it earned, and the block it sets is what the next request meets.
 */
export async function confirmRejectedSignInAttempt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: SignInAttemptInput,
): Promise<ConfirmedSignInRejection> {
  const windowStart = new Date(input.now.getTime() - SIGN_IN_LOCKOUT_WINDOW_MS);

  return db.transaction(async (tx) => {
    await lockSourceAddress(tx, input.sourceAddress);

    const [lockout] = await selectLiveLockout(tx, input.sourceAddress);
    if (lockout && lockout.blockedUntil.getTime() > input.now.getTime()) {
      return { trippedLockout: null };
    }

    const counted = await countAttemptsInWindow(tx, input.sourceAddress, windowStart);
    if (counted.length < SIGN_IN_FAILURE_LIMIT) {
      return { trippedLockout: null };
    }

    return {
      trippedLockout: await tripLockout(tx, input.sourceAddress, input.now, counted.length),
    };
  });
}

/** Takes an admitted attempt back out of the count, for one that was never a rejected sign-in. */
export async function discardSignInAttempt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  attemptId: string,
): Promise<void> {
  await db.delete(signInFailures).where(eq(signInFailures.id, attemptId));
}
