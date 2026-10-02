import type { SignInChallenges } from "@purosur/domain/access/use-cases";
import { eq, inArray, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { signInChallenges } from "../platform/db/schema.js";

const PRUNE_BATCH_SIZE = 100;

export class DrizzleSignInChallenges<TQueryResult extends PgQueryResultHKT>
  implements SignInChallenges
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async discardChallengesIssuedAtOrBefore(cutoff: Date): Promise<void> {
    const expired = this.db
      .select({ id: signInChallenges.id })
      .from(signInChallenges)
      .where(lte(signInChallenges.createdAt, cutoff))
      .limit(PRUNE_BATCH_SIZE)
      .for("update", { skipLocked: true });
    await this.db.delete(signInChallenges).where(inArray(signInChallenges.id, expired));
  }

  async storeChallenge(challenge: string, issuedAt: Date): Promise<void> {
    await this.db.insert(signInChallenges).values({ challenge, createdAt: issuedAt });
  }

  async takeChallenge(challenge: string): Promise<{ issuedAt: Date } | undefined> {
    const [row] = await this.db
      .delete(signInChallenges)
      .where(eq(signInChallenges.challenge, challenge))
      .returning({ issuedAt: signInChallenges.createdAt });
    return row;
  }
}
