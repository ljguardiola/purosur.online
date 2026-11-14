import { describe, expect, it } from "vitest";
import { TICKET_SOURCES } from "./return-reasons.js";
import { ticketVerificationRequired } from "./ticket-verification.js";

describe("ticketVerificationRequired", () => {
  it("requires checking the paper ticket when the ticket was scanned", () => {
    expect(ticketVerificationRequired("QR")).toBe(true);
  });

  it("requires checking the paper ticket when its number was typed", () => {
    expect(ticketVerificationRequired("TYPED")).toBe(true);
  });

  it("does not require it when the sale was chosen from the history", () => {
    expect(ticketVerificationRequired("HISTORY")).toBe(false);
  });

  it("answers for every way a return can start", () => {
    expect(TICKET_SOURCES.map(ticketVerificationRequired)).toEqual([true, true, false]);
  });
});
