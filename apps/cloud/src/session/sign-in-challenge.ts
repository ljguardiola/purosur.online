import { eq, inArray, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { signInChallenges } from "../db/schema.js";

/** Generous relative to `generateAuthenticationOptions`'s own 60-second client-side timeout, so a slow biometric prompt never loses to server-side pruning. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const PRUNE_BATCH_SIZE = 100;

export interface StoreSignInChallengeInput {
  challenge: string;
  now: Date;
}

export interface ConsumeSignInChallengeInput {
  challenge: string;
  now: Date;
}

/** Stores a freshly issued authentication challenge, keyed by its own value. */
export async function storeSignInChallenge<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: StoreSignInChallengeInput,
): Promise<void> {
  await db.insert(signInChallenges).values({ challenge: input.challenge, createdAt: input.now });
}

/** Deletes the row either way: a challenge is redeemable at most once, whether the attempt succeeds or not. */
export async function consumeSignInChallenge<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: ConsumeSignInChallengeInput,
): Promise<boolean> {
  const [row] = await db
    .delete(signInChallenges)
    .where(eq(signInChallenges.challenge, input.challenge))
    .returning({ createdAt: signInChallenges.createdAt });
  if (!row) {
    return false;
  }
  return row.createdAt.getTime() + CHALLENGE_TTL_MS > input.now.getTime();
}

export async function pruneExpiredSignInChallenges<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  now: Date,
): Promise<void> {
  const windowStart = new Date(now.getTime() - CHALLENGE_TTL_MS);
  const expired = db
    .select({ id: signInChallenges.id })
    .from(signInChallenges)
    .where(lte(signInChallenges.createdAt, windowStart))
    .limit(PRUNE_BATCH_SIZE)
    .for("update", { skipLocked: true });
  await db.delete(signInChallenges).where(inArray(signInChallenges.id, expired));
}
