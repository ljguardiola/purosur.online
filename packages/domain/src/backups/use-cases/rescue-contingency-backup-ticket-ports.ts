import type { PushedEvent } from "../../sync/index.js";
import type { RescuedTicketFact } from "../model/rescued-ticket-summary.js";

export type ContingencyBackupTicketOpening =
  | {
      kind: "opened";
      registerId: string;
      registerName: string;
      content: { deviceId: string; events: PushedEvent[] };
    }
  | { kind: "unreadable" }
  | { kind: "incomplete" }
  | { kind: "unknown_key" }
  | { kind: "not_authentic" };

export interface ContingencyBackupTicketOpener {
  open(qrCodes: readonly string[]): Promise<ContingencyBackupTicketOpening>;
}

export interface RescuedTicketDelivery {
  registerId: string;
  deviceId: string;
  events: readonly PushedEvent[];
  rescuedBy: string;
}

export type RescuedTicketDeliveryAnswer =
  | { kind: "delivered"; received: number; alreadyReceived: number }
  | { kind: "foreign_installation" }
  | { kind: "conflicting" };

// Records who rescued the ticket, and what it brought in, together with the events it receives.
export interface RescuedTicketEvents {
  deliver(delivery: RescuedTicketDelivery): Promise<RescuedTicketDeliveryAnswer>;
}

export interface RescuedEventDecoder {
  decode(event: PushedEvent): RescuedTicketFact | null;
}

export interface RescueContingencyBackupTicketPorts {
  opener: ContingencyBackupTicketOpener;
  events: RescuedTicketEvents;
  decoder: RescuedEventDecoder;
}
