import type { PushedEvent } from "../../../sync/index.js";
import type { RescuedTicketFact } from "../../model/rescued-ticket-summary.js";
import type {
  ContingencyBackupTicketOpening,
  ContingencyBackupTicketRescues,
  RescueContingencyBackupTicketTransaction,
  RescuedEventDecoder,
  RescuedTicketDelivery,
  RescuedTicketDeliveryAnswer,
  RescuedTicketRecord,
} from "../rescue-contingency-backup-ticket-ports.js";

export function rescuedEvent(
  deviceSeq: number,
  occurredAt = "2026-10-01T10:00:00.000Z",
): PushedEvent {
  return {
    event_id: `event-${deviceSeq}`,
    device_seq: deviceSeq,
    aggregate_type: "Sale",
    aggregate_id: `sale-${deviceSeq}`,
    event_type: "sale_completed",
    schema_version: 1,
    payload: {},
    occurred_at: occurredAt,
    actor_id: "user-1",
    chain_hmac: `link-${deviceSeq}`,
  };
}

export class FakeRescuedEventDecoder implements RescuedEventDecoder {
  private readonly facts: ReadonlyMap<string, RescuedTicketFact>;

  constructor(facts: ReadonlyMap<string, RescuedTicketFact>) {
    this.facts = facts;
  }

  decode(event: PushedEvent): RescuedTicketFact | null {
    return this.facts.get(event.event_id) ?? null;
  }
}

export interface FakeRescuesAnswers {
  opening: ContingencyBackupTicketOpening;
  delivery?: RescuedTicketDeliveryAnswer;
  failRecording?: boolean;
}

export class FakeContingencyBackupTicketRescues implements ContingencyBackupTicketRescues {
  readonly opened: (readonly string[])[] = [];
  delivered: RescuedTicketDelivery[] = [];
  recorded: RescuedTicketRecord[] = [];

  private readonly answers: FakeRescuesAnswers;

  constructor(answers: FakeRescuesAnswers) {
    this.answers = answers;
  }

  async transaction<TOutcome>(
    work: (tx: RescueContingencyBackupTicketTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const delivered = [...this.delivered];
    const recorded = [...this.recorded];
    const tx: RescueContingencyBackupTicketTransaction = {
      open: async (qrCodes) => {
        this.opened.push(qrCodes);
        return this.answers.opening;
      },
      deliver: async (delivery) => {
        delivered.push(delivery);
        return this.answers.delivery ?? { kind: "delivered", received: 0, alreadyReceived: 0 };
      },
      recordRescue: async (rescue) => {
        if (this.answers.failRecording === true) {
          throw new Error("storage unavailable");
        }
        recorded.push(rescue);
      },
    };
    const outcome = await work(tx);
    this.delivered = delivered;
    this.recorded = recorded;
    return outcome;
  }
}
