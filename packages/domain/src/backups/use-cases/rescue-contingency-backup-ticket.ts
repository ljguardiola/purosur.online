import {
  type RescuedTicketFact,
  type RescuedTicketSummary,
  rescuedTicketSummary,
} from "../model/rescued-ticket-summary.js";
import type { RescueContingencyBackupTicketPorts } from "./rescue-contingency-backup-ticket-ports.js";

export interface RescueContingencyBackupTicketInput {
  qrCodes: readonly string[];
  actorId: string;
}

export type RescueContingencyBackupTicketOutcome =
  | {
      kind: "rescued";
      registerId: string;
      registerName: string;
      received: number;
      alreadyReceived: number;
      summary: RescuedTicketSummary;
    }
  | { kind: "unreadable" }
  | { kind: "incomplete" }
  | { kind: "unknown_key" }
  | { kind: "not_authentic" }
  | { kind: "foreign_installation" }
  | { kind: "conflicting" };

export async function rescueContingencyBackupTicket(
  { rescues, clock, decoder }: RescueContingencyBackupTicketPorts,
  { qrCodes, actorId }: RescueContingencyBackupTicketInput,
): Promise<RescueContingencyBackupTicketOutcome> {
  const rescue = await rescues.transaction(async (tx) => {
    const opening = await tx.open(qrCodes);
    if (opening.kind !== "opened") {
      return opening;
    }
    const { registerId, content } = opening;
    const delivery = await tx.deliver({
      registerId,
      deviceId: content.deviceId,
      events: content.events,
    });
    if (delivery.kind !== "delivered") {
      return delivery;
    }
    await tx.recordRescue({
      registerId,
      actorId,
      received: delivery.received,
      alreadyReceived: delivery.alreadyReceived,
      at: clock.now(),
    });
    return { kind: "rescued" as const, opening, delivery };
  });
  if (rescue.kind !== "rescued") {
    return { kind: rescue.kind };
  }
  const { opening, delivery } = rescue;
  const facts = opening.content.events
    .map((event) => decoder.decode(event))
    .filter((fact): fact is RescuedTicketFact => fact !== null);
  return {
    kind: "rescued",
    registerId: opening.registerId,
    registerName: opening.registerName,
    received: delivery.received,
    alreadyReceived: delivery.alreadyReceived,
    summary: rescuedTicketSummary(opening.content.events, facts),
  };
}
