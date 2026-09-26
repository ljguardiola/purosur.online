import { createHash } from "node:crypto";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { signInFailures, signInLockouts } from "../db/schema.js";

export const SIGN_IN_LOCKOUT_WINDOW_MS = 60 * 60 * 1000;
export const SIGN_IN_FAILURE_LIMIT = 10;
/** Counted from the attempt that tripped it, not from when the block was checked. */
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
  trippedLockout: TrippedSignInLockout | null;
}

/** The lockout tables key by the raw address, but a permanent audit row never stores it in the clear. */
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

/** Spends the attempts it was built from, so the next block needs its own `SIGN_IN_FAILURE_LIMIT` rejected attempts instead of the same ones re-arming it. */
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

  await openAlert(
    tx,
    {
      kind: "backoffice_sign_in_lockout",
      scope: sourceAddress,
      detail: { sourceAddress, failureCount, blockedUntil: blockedUntil.toISOString() },
    },
    { now: () => now },
  );

  return { id: blocked.id, blockedUntil, failureCount };
}

/**
 * Records the attempt in the same locked transaction as the admission check, before credential
 * verification: this is what makes the limit bind under concurrency, since concurrent attempts
 * from one address see each other's count.
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

    // Reaching the limit with no block live means that many attempts are in flight, unsettled: refusing here caps the burst.
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

/** Blocks the address on the attempt that *reaches* the limit, so that attempt still gets the uniform rejection it earned. */
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
