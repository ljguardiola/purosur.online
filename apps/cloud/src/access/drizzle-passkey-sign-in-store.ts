import type {
  OpenedSession,
  PasskeySignInStore,
  PasskeySignInStoreTransaction,
  PasskeyUse,
  PasskeyUseRecording,
} from "@purosur/domain/credentials/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { sessions, signInFailures } from "../platform/db/schema.js";
import { recordPasskeyUse } from "./passkey-use-records.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzlePasskeySignInStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PasskeySignInStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  recordPasskeyUse(use: PasskeyUse): Promise<PasskeyUseRecording> {
    return recordPasskeyUse(this.tx, use);
  }

  async endSession(sessionKey: string, at: Date): Promise<void> {
    await this.tx
      .update(sessions)
      .set({ revokedAt: at })
      .where(eq(sessions.sessionIdHash, sessionKey));
  }

  async openSession(session: OpenedSession): Promise<void> {
    await this.tx.insert(sessions).values({
      userId: session.userId,
      sessionIdHash: session.sessionKey,
      createdAt: session.at,
      lastSeenAt: session.at,
      passkeyAuthorizedAt: session.at,
    });
  }

  async discardSignInAttempt(attemptId: string): Promise<void> {
    await this.tx.delete(signInFailures).where(eq(signInFailures.id, attemptId));
  }
}

export class DrizzlePasskeySignInStore<TQueryResult extends PgQueryResultHKT>
  implements PasskeySignInStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: PasskeySignInStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzlePasskeySignInStoreTransaction(tx)));
  }
}
