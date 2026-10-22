import { describe, expect, it } from "vitest";
import {
  contingencyBackupTicketOfSaleAnswerSchema,
  contingencyBackupTicketsAnswerSchema,
  discardContingencyBackupTicketsOutcomeSchema,
} from "./contingency-backup-ticket-answers.js";

const answer = {
  to_print: 1,
  awaiting_customer_document: 0,
  missing_key: 2,
  kept: 3,
  discardable: 4,
  may_discard: false,
  printer: null,
};

describe("contingencyBackupTicketsAnswerSchema", () => {
  it("accepts the counts of the tickets and no printer failure", () => {
    expect(contingencyBackupTicketsAnswerSchema.parse(answer)).toEqual(answer);
  });

  it.each(["cover_open", "paper_out", "not_responding", "printer_not_configured", "failed"])(
    "accepts a last printer failure of %s",
    (printer) => {
      expect(contingencyBackupTicketsAnswerSchema.parse({ ...answer, printer }).printer).toBe(
        printer,
      );
    },
  );

  it.each([
    ["a negative count", { kept: -1 }],
    ["a fractional count", { to_print: 1.5 }],
    ["a printer failure that does not exist", { printer: "on_fire" }],
    ["a missing may discard", { may_discard: undefined }],
    ["a missing printer", { printer: undefined }],
  ])("refuses %s", (_name, override) => {
    expect(contingencyBackupTicketsAnswerSchema.safeParse({ ...answer, ...override }).success).toBe(
      false,
    );
  });

  it("accepts a count of zero", () => {
    expect(contingencyBackupTicketsAnswerSchema.safeParse({ ...answer, to_print: 0 }).success).toBe(
      true,
    );
  });
});

describe("contingencyBackupTicketOfSaleAnswerSchema", () => {
  it.each([
    "discarded",
    "discardable",
    "kept",
    "no_longer_needed",
    "missing_key",
    "awaiting_customer_document",
    "to_print",
  ])("accepts a ticket standing of %s", (standing) => {
    expect(contingencyBackupTicketOfSaleAnswerSchema.parse({ standing })).toEqual({ standing });
  });

  it("accepts a sale with no ticket", () => {
    expect(contingencyBackupTicketOfSaleAnswerSchema.parse({ standing: null })).toEqual({
      standing: null,
    });
  });

  it("refuses a standing that does not exist", () => {
    expect(contingencyBackupTicketOfSaleAnswerSchema.safeParse({ standing: "lost" }).success).toBe(
      false,
    );
  });
});

describe("discardContingencyBackupTicketsOutcomeSchema", () => {
  it("accepts tickets discarded with their count", () => {
    expect(
      discardContingencyBackupTicketsOutcomeSchema.parse({ kind: "discarded", count: 3 }),
    ).toEqual({ kind: "discarded", count: 3 });
  });

  it("accepts not yet", () => {
    expect(discardContingencyBackupTicketsOutcomeSchema.parse({ kind: "not_yet" })).toEqual({
      kind: "not_yet",
    });
  });

  it.each([
    ["a negative count", { kind: "discarded", count: -1 }],
    ["a missing count", { kind: "discarded" }],
    ["another kind", { kind: "failed" }],
  ])("refuses %s", (_name, outcome) => {
    expect(discardContingencyBackupTicketsOutcomeSchema.safeParse(outcome).success).toBe(false);
  });
});
