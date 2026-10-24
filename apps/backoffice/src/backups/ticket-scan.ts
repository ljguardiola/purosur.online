import { readContingencyBackupTicketQrCode } from "@purosur/contracts";

type PendingTicket = { partCount: number; codes: Record<number, string> };

export type PendingTickets = Record<string, PendingTicket>;

export const NO_PENDING_TICKETS: PendingTickets = {};

export type TicketScanStep =
  | { kind: "unreadable" }
  | { kind: "already_read" }
  | { kind: "waiting"; pending: PendingTickets; read: number; of: number }
  | { kind: "complete"; pending: PendingTickets; qrCodes: string[] };

function ticketKey(part: NonNullable<ReturnType<typeof readContingencyBackupTicketQrCode>>) {
  const nonce = [...part.nonce].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${part.registerId}:${part.keyVersion}:${nonce}`;
}

export function scanTicketCode(pending: PendingTickets, text: string): TicketScanStep {
  const part = readContingencyBackupTicketQrCode(text);
  if (part === null) {
    return { kind: "unreadable" };
  }
  const key = ticketKey(part);
  const ticket = pending[key] ?? { partCount: part.partCount, codes: {} };
  if (part.partIndex in ticket.codes) {
    return { kind: "already_read" };
  }
  const codes = { ...ticket.codes, [part.partIndex]: text };
  const read = Object.keys(codes).length;
  const { [key]: _finished, ...others } = pending;
  if (read < ticket.partCount) {
    return {
      kind: "waiting",
      pending: { ...others, [key]: { partCount: ticket.partCount, codes } },
      read,
      of: ticket.partCount,
    };
  }
  const qrCodes = Object.entries(codes)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, code]) => code);
  return { kind: "complete", pending: others, qrCodes };
}
