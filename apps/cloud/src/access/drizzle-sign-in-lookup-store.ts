import { signInLookupAttemptWindowStart } from "@purosur/domain";
import type {
  SignInCandidate,
  SignInLookupStore,
  SignInLookupStoreTransaction,
} from "@purosur/domain/access/use-cases";
import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registers, signInLookupAttempts, userPins, users } from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleSignInLookupStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements SignInLookupStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  // Counters have no row of their own to lock before their first attempt, so the register takes
  // a transaction-scoped advisory lock instead.
  async lockSignInLookupAttempts(registerId: string): Promise<void> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`sign_in_lookup:${registerId}`}, 0))`,
    );
  }

  async acceptedSignInLookupAttempts(registerId: string, since: Date): Promise<Date[]> {
    const rows = await this.tx
      .select({ attemptedAt: signInLookupAttempts.attemptedAt })
      .from(signInLookupAttempts)
      .where(
        and(
          eq(signInLookupAttempts.registerId, registerId),
          gt(signInLookupAttempts.attemptedAt, since),
        ),
      )
      .orderBy(desc(signInLookupAttempts.attemptedAt));
    return rows.map((row) => row.attemptedAt);
  }

  async recordSignInLookupAttempt(registerId: string, attemptedAt: Date): Promise<void> {
    await this.tx
      .delete(signInLookupAttempts)
      .where(lte(signInLookupAttempts.attemptedAt, signInLookupAttemptWindowStart(attemptedAt)));
    await this.tx.insert(signInLookupAttempts).values({ registerId, attemptedAt });
  }

  async findSignInCandidate(
    registerId: string,
    email: string,
  ): Promise<SignInCandidate | undefined> {
    const [row] = await this.tx
      .select({ userId: users.id, pinUserId: userPins.userId })
      .from(users)
      .innerJoin(registers, eq(registers.locationId, users.locationId))
      .leftJoin(userPins, eq(userPins.userId, users.id))
      .where(and(eq(registers.id, registerId), eq(users.email, email), eq(users.active, true)));
    return row && { userId: row.userId, hasPin: row.pinUserId !== null };
  }
}

export class DrizzleSignInLookupStore<TQueryResult extends PgQueryResultHKT>
  implements SignInLookupStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: SignInLookupStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleSignInLookupStoreTransaction(tx)));
  }
}
