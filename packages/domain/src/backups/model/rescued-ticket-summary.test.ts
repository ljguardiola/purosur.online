import { describe, expect, it } from "vitest";
import { rescuedTicketSummary, type RescuedTicketFact } from "./rescued-ticket-summary.js";

function event(occurredAt: string): { occurred_at: string } {
  return { occurred_at: occurredAt };
}

const OFFLINE_VOUCHER: RescuedTicketFact = {
  kind: "offline_fiscal_document_issued",
  document: { pointOfSale: 12, documentType: "factura_c", number: 345 },
};

describe("rescuedTicketSummary", () => {
  it.each([
    ["sale_completed", "sale"],
    ["sale_cancelled", "paid_sale_cancellation"],
    ["sale_voided", "sale_void"],
    ["cash_movement_recorded", "cash_movement"],
    ["cash_session_opened", "cash_session_opening"],
    ["cash_session_closed", "cash_session_closing"],
    ["opening_count_recorded", "initial_count"],
    ["opening_count_withdrawn", "initial_count"],
    ["clock_corrected", "clock_correction"],
    ["reprint_recorded", "reprint"],
  ] as const)("names the operation of a ticket carrying %s as %s", (kind, operation) => {
    const fact: RescuedTicketFact =
      kind === "sale_completed" ? { kind, sale: { total: 100 } } : { kind };

    expect(rescuedTicketSummary([event("2026-10-01T10:00:00.000Z")], [fact]).operation).toBe(
      operation,
    );
  });

  it("names the operation after the first fact that stands for one", () => {
    const summary = rescuedTicketSummary(
      [event("2026-10-01T10:00:00.000Z")],
      [{ kind: "sale_print_state_changed" }, OFFLINE_VOUCHER, { kind: "sale_voided" }, { kind: "reprint_recorded" }],
    );

    expect(summary.operation).toBe("sale_void");
  });

  it("names no operation when no fact stands for one", () => {
    const summary = rescuedTicketSummary(
      [event("2026-10-01T10:00:00.000Z")],
      [{ kind: "sale_print_state_changed" }, OFFLINE_VOUCHER],
    );

    expect(summary.operation).toBeNull();
  });

  it("reports the earliest moment its events occurred", () => {
    const summary = rescuedTicketSummary(
      [
        event("2026-10-01T10:05:00.000Z"),
        event("2026-10-01T09:59:59.000Z"),
        event("2026-10-01T10:00:00.000Z"),
      ],
      [],
    );

    expect(summary.occurredAt).toBe("2026-10-01T09:59:59.000Z");
  });

  it("reports no moment when it has no events", () => {
    expect(rescuedTicketSummary([], []).occurredAt).toBeNull();
  });

  it("lists the offline vouchers it carries in the order of its facts", () => {
    const summary = rescuedTicketSummary(
      [event("2026-10-01T10:00:00.000Z")],
      [
        OFFLINE_VOUCHER,
        { kind: "sale_completed", sale: { total: 50 } },
        {
          kind: "offline_fiscal_document_issued",
          document: { pointOfSale: 12, documentType: "credit_note_c", number: 7 },
        },
      ],
    );

    expect(summary.vouchers).toEqual([
      { pointOfSale: 12, documentType: "factura_c", number: 345 },
      { pointOfSale: 12, documentType: "credit_note_c", number: 7 },
    ]);
  });

  it("lists no voucher when it carries none", () => {
    expect(rescuedTicketSummary([event("2026-10-01T10:00:00.000Z")], []).vouchers).toEqual([]);
  });

  it("reports the total of the sale it carries", () => {
    const summary = rescuedTicketSummary(
      [event("2026-10-01T10:00:00.000Z")],
      [{ kind: "sale_voided" }, { kind: "sale_completed", sale: { total: 1234 } }],
    );

    expect(summary.saleTotal).toBe(1234);
  });

  it("reports no sale total when it carries no sale", () => {
    expect(
      rescuedTicketSummary([event("2026-10-01T10:00:00.000Z")], [{ kind: "sale_voided" }])
        .saleTotal,
    ).toBeNull();
  });
});
