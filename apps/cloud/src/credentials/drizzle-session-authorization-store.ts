import type {
  PasskeyUse,
  PasskeyUseRecording,
  SessionAuthorizationStore,
  SessionAuthorizationStoreTransaction,
} from "@purosur/domain/credentials/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { sessions } from "../platform/db/schema.js";
import { recordPasskeyUse } from "./passkey-use-records.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleSessionAuthorizationStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements SessionAuthorizationStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  recordPasskeyUse(use: PasskeyUse): Promise<PasskeyUseRecording> {
    return recordPasskeyUse(this.tx, use);
  }

  async authorizeSession(sessionId: string, at: Date): Promise<void> {
    await this.tx
      .update(sessions)
      .set({ passkeyAuthorizedAt: at })
      .where(eq(sessions.id, sessionId));
  }
}

export class DrizzleSessionAuthorizationStore<TQueryResult extends PgQueryResultHKT>
  implements SessionAuthorizationStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: SessionAuthorizationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleSessionAuthorizationStoreTransaction(tx)));
  }
}
