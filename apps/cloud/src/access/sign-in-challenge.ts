import { challengeExpiryWindowStart } from "@purosur/domain";
import type { SignInChallenges } from "@purosur/domain/access/use-cases";
import { eq, inArray, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { signInChallenges } from "../platform/db/schema.js";

const PRUNE_BATCH_SIZE = 100;

export interface StoreSignInChallengeInput {
  challenge: string;
  now: Date;
}

export async function storeSignInChallenge<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: StoreSignInChallengeInput,
): Promise<void> {
  await db.insert(signInChallenges).values({ challenge: input.challenge, createdAt: input.now });
}

export class DrizzleSignInChallenges<TQueryResult extends PgQueryResultHKT>
  implements SignInChallenges
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async takeChallenge(challenge: string): Promise<{ issuedAt: Date } | undefined> {
    const [row] = await this.db
      .delete(signInChallenges)
      .where(eq(signInChallenges.challenge, challenge))
      .returning({ issuedAt: signInChallenges.createdAt });
    return row;
  }
}

export async function pruneExpiredSignInChallenges<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  now: Date,
): Promise<void> {
  const expired = db
    .select({ id: signInChallenges.id })
    .from(signInChallenges)
    .where(lte(signInChallenges.createdAt, challengeExpiryWindowStart(now)))
    .limit(PRUNE_BATCH_SIZE)
    .for("update", { skipLocked: true });
  await db.delete(signInChallenges).where(inArray(signInChallenges.id, expired));
}
