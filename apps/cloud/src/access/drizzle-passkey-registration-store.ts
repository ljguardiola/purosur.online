import type {
  AddedPasskey,
  PasskeyRegistrationAlert,
  PasskeyRegistrationStore,
  PasskeyRegistrationStoreTransaction,
  RecoveredPasskey,
  RegisteredPasskey,
} from "@purosur/domain/access/use-cases";
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

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  addPasskey(passkey: RecoveredPasskey): Promise<AddedPasskey> {
    return addPasskey(this.tx, passkey);
  }

  recordPasskeyRegistered(
    userId: string,
    passkey: RegisteredPasskey,
    details: RecoveredPasskey,
  ): Promise<void> {
    return recordPasskeyRegistered(this.tx, userId, passkey, details);
  }

  openPasskeyRegisteredAlert(alert: PasskeyRegistrationAlert): Promise<void> {
    return openPasskeyRegisteredAlert(this.tx, alert, "self");
  }
}

export class DrizzlePasskeyRegistrationStore<TQueryResult extends PgQueryResultHKT>
  implements PasskeyRegistrationStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: PasskeyRegistrationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzlePasskeyRegistrationStoreTransaction(tx)));
  }
}
