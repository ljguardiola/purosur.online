import type { ContingencyBackupTicketsAnswer } from "@purosur/contracts";

export function hasPendingBackupTickets(tickets: ContingencyBackupTicketsAnswer): boolean {
  return tickets.to_print + tickets.awaiting_customer_document > 0;
}

export function contingencyBackupTicketsNoticeCount(
  tickets: ContingencyBackupTicketsAnswer,
): number {
  return (
    Number(hasPendingBackupTickets(tickets)) +
    Number(tickets.missing_key > 0) +
    Number(tickets.may_discard)
  );
}
