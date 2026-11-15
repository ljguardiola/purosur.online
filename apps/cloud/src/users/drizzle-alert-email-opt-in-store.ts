import type {
  AlertEmailOptInStore,
  AlertEmailOptInStoreTransaction,
  RecipientsChangedAlert,
  UserChange,
} from "@purosur/domain/users/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { users } from "../platform/db/schema.js";
import { recordUserChange } from "./record-user-change.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzleAlertEmailOptInStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements AlertEmailOptInStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;
  private readonly now: () => Date;

  constructor(tx: Transaction<TQueryResult>, now: () => Date) {
    this.tx = tx;
    this.now = now;
  }

  async lockBranchUserOptIn(
    userId: string,
    locationId: string,
  ): Promise<{ optedInAt: Date | null } | undefined> {
    const [row] = await this.tx
      .select({ optedInAt: users.alertEmailOptedInAt })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.locationId, locationId), eq(users.active, true)))
      .for("update");
    return row;
  }

  async recordOptIn(userId: string, at: Date): Promise<void> {
    await this.tx.update(users).set({ alertEmailOptedInAt: at }).where(eq(users.id, userId));
  }

  async clearOptIn(userId: string): Promise<void> {
    await this.tx.update(users).set({ alertEmailOptedInAt: null }).where(eq(users.id, userId));
  }

  recordUserChange(userId: string, actorId: string, change: UserChange): Promise<void> {
    return recordUserChange(this.tx, this.now(), userId, actorId, change);
  }

  async openRecipientsChangedAlert(alert: RecipientsChangedAlert): Promise<void> {
    await openAlert(
      this.tx,
      {
        kind: "alert_recipients_changed",
        scope: alert.userId,
        detail: { change: alert.change, actorId: alert.actorId },
      },
      { now: () => alert.openedAt },
    );
  }
}

export class DrizzleAlertEmailOptInStore<TQueryResult extends PgQueryResultHKT>
  implements AlertEmailOptInStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: AlertEmailOptInStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleAlertEmailOptInStoreTransaction(tx, this.now)),
    );
  }
}
