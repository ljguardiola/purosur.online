import {
  contingencyBackupTicketStanding,
  contingencyBackupTicketsSummary,
} from "../model/contingency-backup-ticket.js";
import type { DiscardContingencyBackupTicketsPorts } from "./contingency-backup-ticket-ports.js";

export type DiscardContingencyBackupTicketsOutcome =
  | { kind: "discarded"; count: number }
  | { kind: "not_yet" };

export async function discardContingencyBackupTickets({
  clock,
  store,
}: DiscardContingencyBackupTicketsPorts): Promise<DiscardContingencyBackupTicketsOutcome> {
  return store.transaction<DiscardContingencyBackupTicketsOutcome>(async (tx) => {
    const acknowledged = await tx.acknowledgedThroughSeq();
    const tickets = await tx.ticketsToConsider();
    if (!contingencyBackupTicketsSummary(tickets, acknowledged).mayDiscard) {
      return { kind: "not_yet" };
    }
    const discardable = tickets.filter(
      (ticket) => contingencyBackupTicketStanding(ticket, acknowledged) === "discardable",
    );
    await tx.markDiscarded(
      discardable.map((ticket) => ticket.id),
      clock.now(),
    );
    return { kind: "discarded", count: discardable.length };
  });
}
