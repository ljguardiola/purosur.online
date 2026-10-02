import type {
  PasskeyRemovalAlert,
  PasskeyRemovalStore,
  PasskeyRemovalStoreTransaction,
  RemovedPasskey,
} from "@purosur/domain/access/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { auditLog, passkeys } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { revokeSessions } from "./revoke-sessions.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

class DrizzlePasskeyRemovalStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements PasskeyRemovalStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async deletePasskey(userId: string, passkeyId: string): Promise<RemovedPasskey | undefined> {
    if (!UUID_PATTERN.test(passkeyId)) {
      return undefined;
    }
    const [removed] = await this.tx
      .delete(passkeys)
      .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)))
      .returning({ id: passkeys.id, name: passkeys.name });
    return removed;
  }

  revokeSessions(userId: string, at: Date): Promise<void> {
    return revokeSessions(this.tx, userId, at);
  }

  async recordOwnPasskeyRemoved(userId: string, passkey: RemovedPasskey): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "passkey",
      entityId: passkey.id,
      actorId: userId,
      previousValue: { id: passkey.id, name: passkey.name },
      newValue: null,
    });
  }

  async recordUserPasskeyRemoved(
    administratorId: string,
    userId: string,
    passkey: RemovedPasskey,
  ): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "passkey",
      entityId: passkey.id,
      actorId: administratorId,
      previousValue: { id: passkey.id, name: passkey.name, userId },
      newValue: null,
    });
  }

  async openPasskeyRemovedAlert(alert: PasskeyRemovalAlert): Promise<void> {
    await openAlert(
      this.tx,
      {
        kind: "backoffice_passkey_changed",
        scope: alert.userId,
        detail: {
          action: "removed",
          passkeyName: alert.passkeyName,
          actorId: alert.actorId,
          via: alert.via,
        },
      },
      { now: () => alert.openedAt },
    );
  }
}

export class DrizzlePasskeyRemovalStore<TQueryResult extends PgQueryResultHKT>
  implements PasskeyRemovalStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: PasskeyRemovalStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzlePasskeyRemovalStoreTransaction(tx)));
  }
}
