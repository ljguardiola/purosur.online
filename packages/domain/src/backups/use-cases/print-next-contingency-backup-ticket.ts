import type { ContingencyBackupPrintFailureReason } from "../model/contingency-backup-ticket.js";
import { contingencyBackupTicketStanding } from "../model/contingency-backup-ticket.js";
import type { PrintNextContingencyBackupTicketPorts } from "./contingency-backup-ticket-ports.js";

export type PrintNextContingencyBackupTicketOutcome =
  | { kind: "printed"; ticketId: string }
  | { kind: "not_printed"; ticketId: string; reason: ContingencyBackupPrintFailureReason }
  | { kind: "nothing_to_print" };

export async function printNextContingencyBackupTicket({
  clock,
  printer,
  store,
}: PrintNextContingencyBackupTicketPorts): Promise<PrintNextContingencyBackupTicketOutcome> {
  const toPrint = await store.transaction(async (tx) => {
    const acknowledged = await tx.acknowledgedThroughSeq();
    return (await tx.ticketsToConsider()).filter(
      (ticket) => contingencyBackupTicketStanding(ticket, acknowledged) === "to_print",
    );
  });

  for (const next of toPrint) {
    const printing = await printer.print(next.id);
    if (printing.kind === "unrenderable") continue;
    if (printing.kind === "not_sent") {
      return { kind: "not_printed", ticketId: next.id, reason: printing.reason };
    }
    await store.transaction((tx) => tx.markPrinted(next.id, clock.now()));
    return { kind: "printed", ticketId: next.id };
  }
  return { kind: "nothing_to_print" };
}
