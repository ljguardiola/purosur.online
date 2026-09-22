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

export interface AdmitSignInAttemptInput {
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
      /** Set only on the attempt whose admission set the block, so each block is audited once. */
      trippedLockout: TrippedSignInLockout | null;
    };

/**
 * Hashes a source address for the audit log the same way #167 hashes its own rate-limit keys
 * (SHA-256, hex-encoded): the lockout tables themselves key by the raw address (never looked up by
 * anything else), but a permanent audit row never stores it in the clear.
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

/**
 * Decides whether a source address may attempt to sign in at all, and records the attempt against
 * it in the same locked transaction, the way `recovery-rate-limiter.ts` records before admitting
 * the work it guards. Recording first is what makes the limit bind: an attempt is counted from the
 * moment it is admitted, so concurrent attempts from one address see each other and only
 * `SIGN_IN_FAILURE_LIMIT` of them ever reach credential verification.
 *
 * The recorded attempt stands as a rejected one unless `discardSignInAttempt` takes it back, which
 * is what a sign-in that succeeds — or a request too malformed to reach verification — does.
 *
 * The attempt that finds the limit already reached sets the address's 15-minute block and spends
 * the failures the block was built from, so the block lasts the 15 minutes it says it does: the
 * next one needs its own ten rejected attempts instead of the same ten re-arming it for the rest
 * of the hour.
 */
export async function admitSignInAttempt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: AdmitSignInAttemptInput,
): Promise<SignInAttemptAdmission> {
  const windowStart = new Date(input.now.getTime() - SIGN_IN_LOCKOUT_WINDOW_MS);
  await pruneExpiredFailures(db, windowStart);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.sourceAddress}, 0))`,
    );

    const [lockout] = await tx
      .select({ blockedUntil: signInLockouts.blockedUntil })
      .from(signInLockouts)
      .where(eq(signInLockouts.sourceAddress, input.sourceAddress))
      .limit(1);
    if (lockout && lockout.blockedUntil.getTime() > input.now.getTime()) {
      return {
        admitted: false,
        blockedUntil: lockout.blockedUntil,
        trippedLockout: null,
      } as const;
    }

    const counted = await tx
      .select({ id: signInFailures.id })
      .from(signInFailures)
      .where(
        and(
          eq(signInFailures.sourceAddress, input.sourceAddress),
          gt(signInFailures.attemptedAt, windowStart),
        ),
      );

    if (counted.length >= SIGN_IN_FAILURE_LIMIT) {
      const blockedUntil = new Date(input.now.getTime() + SIGN_IN_BLOCK_DURATION_MS);
      const [blocked] = await tx
        .insert(signInLockouts)
        .values({ sourceAddress: input.sourceAddress, blockedUntil })
        .onConflictDoUpdate({
          target: signInLockouts.sourceAddress,
          set: { blockedUntil },
        })
        .returning({ id: signInLockouts.id });
      if (!blocked) {
        throw new Error("sign-in lockout upsert returned no row");
      }
      await tx.delete(signInFailures).where(eq(signInFailures.sourceAddress, input.sourceAddress));

      return {
        admitted: false,
        blockedUntil,
        trippedLockout: { id: blocked.id, blockedUntil, failureCount: counted.length },
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

/** Takes an admitted attempt back out of the count, for one that was never a rejected sign-in. */
export async function discardSignInAttempt<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  attemptId: string,
): Promise<void> {
  await db.delete(signInFailures).where(eq(signInFailures.id, attemptId));
}
