import type {
  AddedPasskey,
  PasskeyRegistrationAlert,
  PasskeyRegistrationStore,
  PasskeyRegistrationStoreTransaction,
  RecoveredPasskey,
  RegisteredPasskey,
} from "@purosur/domain/credentials/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  addPasskey,
  openPasskeyRegisteredAlert,
  recordPasskeyRegistered,
} from "./passkey-registration-records.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzlePasskeyRegistrationStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PasskeyRegistrationStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly now: () => Date;

  constructor(tx: Transaction<TQueryResult>, now: () => Date) {
    this.tx = tx;
    this.now = now;
  }

  addPasskey(passkey: RecoveredPasskey): Promise<AddedPasskey> {
    return addPasskey(this.tx, passkey, this.now());
  }

  recordPasskeyRegistered(
    userId: string,
    passkey: RegisteredPasskey,
    details: RecoveredPasskey,
  ): Promise<void> {
    return recordPasskeyRegistered(this.tx, userId, passkey, details, this.now());
  }

  openPasskeyRegisteredAlert(alert: PasskeyRegistrationAlert): Promise<void> {
    return openPasskeyRegisteredAlert(this.tx, alert, "self");
  }
}

export class DrizzlePasskeyRegistrationStore<TQueryResult extends PgQueryResultHKT>
  implements PasskeyRegistrationStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: PasskeyRegistrationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzlePasskeyRegistrationStoreTransaction(tx, this.now)),
    );
  }
}
