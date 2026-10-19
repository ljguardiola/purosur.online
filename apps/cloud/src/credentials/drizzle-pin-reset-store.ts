import type { PinResetStore, PinResetStoreTransaction } from "@purosur/domain/credentials/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import { requirePinResetOfUsers } from "./require-pin-reset-of-users.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzlePinResetStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PinResetStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly pending: PendingChanges;
  private readonly now: () => Date;

  constructor(tx: Transaction<TQueryResult>, pending: PendingChanges, now: () => Date) {
    this.tx = tx;
    this.pending = pending;
    this.now = now;
  }

  requirePinResetOfEveryUser(actorId: string): Promise<number> {
    return requirePinResetOfUsers(this.tx, this.pending, {
      actorId,
      requiredBy: "compromise_response",
      at: this.now(),
    });
  }
}

export class DrizzlePinResetStore<TQueryResult extends PgQueryResultHKT>
  implements PinResetStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: PinResetStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzlePinResetStoreTransaction(tx, pending, this.now)),
    );
  }
}
