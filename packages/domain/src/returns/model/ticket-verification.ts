import type { TicketSource } from "./return-reasons.js";

export function ticketVerificationRequired(source: TicketSource): boolean {
  return source !== "HISTORY";
}
