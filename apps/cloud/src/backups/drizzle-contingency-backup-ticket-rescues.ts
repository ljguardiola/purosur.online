import type {
  ContingencyBackupTicketOpening,
  ContingencyBackupTicketRescues,
  RescueContingencyBackupTicketTransaction,
  RescuedTicketDelivery,
  RescuedTicketDeliveryAnswer,
  RescuedTicketRecord,
} from "@purosur/domain/backups/use-cases";
import { receiveRescuedEvents } from "@purosur/domain/sync/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog } from "../platform/db/schema.js";
import type { InstallationKeyCipher } from "../register/installation-key-cipher.js";
import { DrizzleInbox } from "../sync/drizzle-inbox.js";
import type { EnqueueEventApplication } from "../sync/graphile-event-application-queue.js";
import { DrizzleContingencyBackupTicketOpener } from "./drizzle-contingency-backup-ticket-opener.js";

class DrizzleRescueContingencyBackupTicketTransaction<TQueryResult extends PgQueryResultHKT>
  implements RescueContingencyBackupTicketTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly cipher: InstallationKeyCipher;
  private readonly enqueueApplication: EnqueueEventApplication;
  private readonly now: () => Date;

  constructor(
    tx: PgDatabase<TQueryResult>,
    cipher: InstallationKeyCipher,
    enqueueApplication: EnqueueEventApplication,
    now: () => Date,
  ) {
    this.tx = tx;
    this.cipher = cipher;
    this.enqueueApplication = enqueueApplication;
    this.now = now;
  }

  open(qrCodes: readonly string[]): Promise<ContingencyBackupTicketOpening> {
    return new DrizzleContingencyBackupTicketOpener(this.tx, this.cipher).open(qrCodes);
  }

  async deliver(delivery: RescuedTicketDelivery): Promise<RescuedTicketDeliveryAnswer> {
    const outcome = await receiveRescuedEvents(
      {
        inbox: new DrizzleInbox(this.tx, this.cipher, this.enqueueApplication),
        clock: { now: this.now },
      },
      delivery,
    );
    return outcome.kind === "received"
      ? { kind: "delivered", received: outcome.received, alreadyReceived: outcome.alreadyReceived }
      : outcome;
  }

  async recordRescue({
    registerId,
    actorId,
    received,
    alreadyReceived,
    at,
  }: RescuedTicketRecord): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "contingency_backup_ticket_rescue",
      entityId: registerId,
      actorId,
      previousValue: null,
      newValue: { received, already_received: alreadyReceived },
      at,
    });
  }
}

export class DrizzleContingencyBackupTicketRescues<TQueryResult extends PgQueryResultHKT>
  implements ContingencyBackupTicketRescues
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly cipher: InstallationKeyCipher;
  private readonly enqueueApplication: EnqueueEventApplication;
  private readonly now: () => Date;

  constructor(
    db: PgDatabase<TQueryResult>,
    cipher: InstallationKeyCipher,
    enqueueApplication: EnqueueEventApplication,
    now: () => Date,
  ) {
    this.db = db;
    this.cipher = cipher;
    this.enqueueApplication = enqueueApplication;
    this.now = now;
  }

  transaction<TOutcome>(
    work: (tx: RescueContingencyBackupTicketTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(
        new DrizzleRescueContingencyBackupTicketTransaction(
          tx,
          this.cipher,
          this.enqueueApplication,
          this.now,
        ),
      ),
    );
  }
}
