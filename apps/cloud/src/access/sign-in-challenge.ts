import type {
  SignInChallenges,
  SignInChallengesTransaction,
} from "@purosur/domain/access/use-cases";
import { eq, inArray, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { signInChallenges } from "../platform/db/schema.js";

const PRUNE_BATCH_SIZE = 100;

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleSignInChallengesTransaction<TQueryResult extends PgQueryResultHKT>
  implements SignInChallengesTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async discardChallengesIssuedAtOrBefore(cutoff: Date): Promise<void> {
    const expired = this.tx
      .select({ id: signInChallenges.id })
      .from(signInChallenges)
      .where(lte(signInChallenges.createdAt, cutoff))
      .limit(PRUNE_BATCH_SIZE)
      .for("update", { skipLocked: true });
    await this.tx.delete(signInChallenges).where(inArray(signInChallenges.id, expired));
  }

  async storeChallenge(challenge: string, issuedAt: Date): Promise<void> {
    await this.tx.insert(signInChallenges).values({ challenge, createdAt: issuedAt });
  }

  async takeChallenge(challenge: string): Promise<{ issuedAt: Date } | undefined> {
    const [row] = await this.tx
      .delete(signInChallenges)
      .where(eq(signInChallenges.challenge, challenge))
      .returning({ issuedAt: signInChallenges.createdAt });
    return row;
  }
}

export class DrizzleSignInChallenges<TQueryResult extends PgQueryResultHKT>
  implements SignInChallenges
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: SignInChallengesTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleSignInChallengesTransaction(tx)));
  }
}
