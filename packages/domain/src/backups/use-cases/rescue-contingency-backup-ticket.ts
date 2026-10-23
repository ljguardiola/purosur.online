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
  { opener, events, decoder, audit }: RescueContingencyBackupTicketPorts,
  { qrCodes, actorId }: RescueContingencyBackupTicketInput,
): Promise<RescueContingencyBackupTicketOutcome> {
  const opening = await opener.open(qrCodes);
  if (opening.kind !== "opened") {
    return { kind: opening.kind };
  }
  const { registerId, registerName, content } = opening;
  const delivery = await events.deliver({
    registerId,
    deviceId: content.deviceId,
    events: content.events,
  });
  if (delivery.kind !== "delivered") {
    return { kind: delivery.kind };
  }
  await audit.recordRescue({
    registerId,
    actorId,
    received: delivery.received,
    alreadyReceived: delivery.alreadyReceived,
  });
  const facts = content.events
    .map((event) => decoder.decode(event))
    .filter((fact): fact is RescuedTicketFact => fact !== null);
  return {
    kind: "rescued",
    registerId,
    registerName,
    received: delivery.received,
    alreadyReceived: delivery.alreadyReceived,
    summary: rescuedTicketSummary(content.events, facts),
  };
}
