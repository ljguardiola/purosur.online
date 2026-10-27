import {
  type ContingencyBackupTicketPart,
  readContingencyBackupTicketQrCode,
  sameContingencyBackupTicket,
} from "@purosur/contracts";

type PendingTicket = { part: ContingencyBackupTicketPart; codes: Record<number, string> };

export type PendingTickets = readonly PendingTicket[];

export const NO_PENDING_TICKETS: PendingTickets = [];

export type TicketScanStep =
  | { kind: "unreadable" }
  | { kind: "already_read" }
  | { kind: "waiting"; pending: PendingTickets; read: number; of: number }
  | { kind: "complete"; pending: PendingTickets; qrCodes: string[] };

export function scanTicketCode(pending: PendingTickets, text: string): TicketScanStep {
  const part = readContingencyBackupTicketQrCode(text);
  if (part === null) {
    return { kind: "unreadable" };
  }
  const ticket = pending.find((held) => sameContingencyBackupTicket(held.part, part)) ?? {
    part,
    codes: {},
  };
  if (part.partIndex in ticket.codes) {
    return { kind: "already_read" };
  }
  const codes = { ...ticket.codes, [part.partIndex]: text };
  const read = Object.keys(codes).length;
  const others = pending.filter((held) => held !== ticket);
  if (read < part.partCount) {
    return {
      kind: "waiting",
      pending: [...others, { part: ticket.part, codes }],
      read,
      of: part.partCount,
    };
  }
  const qrCodes = Object.entries(codes)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, code]) => code);
  return { kind: "complete", pending: others, qrCodes };
}
