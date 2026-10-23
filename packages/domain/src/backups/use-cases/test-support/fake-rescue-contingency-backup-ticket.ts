import type { PushedEvent } from "../../../sync/index.js";
import type { RescuedTicketFact } from "../../model/rescued-ticket-summary.js";
import type {
  ContingencyBackupTicketOpener,
  ContingencyBackupTicketOpening,
  RescuedEventDecoder,
  RescuedTicketDelivery,
  RescuedTicketDeliveryAnswer,
  RescuedTicketEvents,
} from "../rescue-contingency-backup-ticket-ports.js";

export function rescuedEvent(deviceSeq: number, occurredAt = "2026-10-01T10:00:00.000Z"): PushedEvent {
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

export class FakeContingencyBackupTicketOpener implements ContingencyBackupTicketOpener {
  readonly opened: (readonly string[])[] = [];

  constructor(private readonly answer: ContingencyBackupTicketOpening) {}

  async open(qrCodes: readonly string[]): Promise<ContingencyBackupTicketOpening> {
    this.opened.push(qrCodes);
    return this.answer;
  }
}

export class FakeRescuedEventDecoder implements RescuedEventDecoder {
  constructor(private readonly facts: ReadonlyMap<string, RescuedTicketFact>) {}

  decode(event: PushedEvent): RescuedTicketFact | null {
    return this.facts.get(event.event_id) ?? null;
  }
}

export class FakeRescuedTicketEvents implements RescuedTicketEvents {
  readonly delivered: RescuedTicketDelivery[] = [];

  constructor(
    private readonly answer: RescuedTicketDeliveryAnswer = {
      kind: "delivered",
      received: 0,
      alreadyReceived: 0,
    },
  ) {}

  async deliver(delivery: RescuedTicketDelivery): Promise<RescuedTicketDeliveryAnswer> {
    this.delivered.push(delivery);
    return this.answer;
  }
}
