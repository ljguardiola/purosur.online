import type { Clock } from "../../shared/index.js";
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

export interface RescuedTicketDelivery {
  registerId: string;
  deviceId: string;
  events: readonly PushedEvent[];
}

export type RescuedTicketDeliveryAnswer =
  | { kind: "delivered"; received: number; alreadyReceived: number }
  | { kind: "foreign_installation" }
  | { kind: "conflicting" };

export interface RescuedTicketRecord {
  registerId: string;
  actorId: string;
  received: number;
  alreadyReceived: number;
  at: Date;
}

export interface RescueContingencyBackupTicketTransaction {
  open(qrCodes: readonly string[]): Promise<ContingencyBackupTicketOpening>;
  deliver(delivery: RescuedTicketDelivery): Promise<RescuedTicketDeliveryAnswer>;
  recordRescue(rescue: RescuedTicketRecord): Promise<void>;
}

export interface ContingencyBackupTicketRescues {
  transaction<TOutcome>(
    work: (tx: RescueContingencyBackupTicketTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RescuedEventDecoder {
  decode(event: PushedEvent): RescuedTicketFact | null;
}

export interface RescueContingencyBackupTicketPorts {
  rescues: ContingencyBackupTicketRescues;
  clock: Clock;
  decoder: RescuedEventDecoder;
}
