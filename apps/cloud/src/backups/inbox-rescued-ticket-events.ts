import type {
  RescuedTicketDelivery,
  RescuedTicketDeliveryAnswer,
  RescuedTicketEvents,
} from "@purosur/domain/backups/use-cases";
import {
  type ReceiveRescuedEventsOutcome,
  receiveRescuedEvents,
} from "@purosur/domain/sync/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog } from "../platform/db/schema.js";
import type { InstallationKeyCipher } from "../register/installation-key-cipher.js";
import { DrizzleInbox } from "../sync/drizzle-inbox.js";
import type { EnqueueEventApplication } from "../sync/graphile-event-application-queue.js";

export class InboxRescuedTicketEvents<TQueryResult extends PgQueryResultHKT>
  implements RescuedTicketEvents
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

  deliver({ rescuedBy, ...delivery }: RescuedTicketDelivery): Promise<RescuedTicketDeliveryAnswer> {
    return this.db.transaction(async (tx) => {
      const outcome = await receiveRescuedEvents(
        {
          inbox: new DrizzleInbox(tx, this.cipher, this.enqueueApplication),
          clock: { now: this.now },
        },
        delivery,
      );
      if (outcome.kind === "received") {
        await tx.insert(auditLog).values({
          entity: "contingency_backup_ticket_rescue",
          entityId: delivery.registerId,
          actorId: rescuedBy,
          previousValue: null,
          newValue: { received: outcome.received, already_received: outcome.alreadyReceived },
          at: this.now(),
        });
      }
      return answerOf(outcome);
    });
  }
}

function answerOf(outcome: ReceiveRescuedEventsOutcome): RescuedTicketDeliveryAnswer {
  return outcome.kind === "received"
    ? { kind: "delivered", received: outcome.received, alreadyReceived: outcome.alreadyReceived }
    : outcome;
}
