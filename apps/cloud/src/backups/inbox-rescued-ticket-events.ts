import type {
  RescuedTicketDelivery,
  RescuedTicketDeliveryAnswer,
  RescuedTicketEvents,
} from "@purosur/domain/backups/use-cases";
import type { Inbox } from "@purosur/domain/sync/use-cases";
import {
  type ReceiveRescuedEventsOutcome,
  receiveRescuedEvents,
} from "@purosur/domain/sync/use-cases";

export class InboxRescuedTicketEvents implements RescuedTicketEvents {
  private readonly inbox: Inbox;
  private readonly now: () => Date;

  constructor(inbox: Inbox, now: () => Date) {
    this.inbox = inbox;
    this.now = now;
  }

  async deliver(delivery: RescuedTicketDelivery): Promise<RescuedTicketDeliveryAnswer> {
    const outcome = await receiveRescuedEvents(
      { inbox: this.inbox, clock: { now: this.now } },
      delivery,
    );
    return answerOf(outcome);
  }
}

function answerOf(outcome: ReceiveRescuedEventsOutcome): RescuedTicketDeliveryAnswer {
  return outcome.kind === "received"
    ? { kind: "delivered", received: outcome.received, alreadyReceived: outcome.alreadyReceived }
    : outcome;
}
