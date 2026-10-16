import { describe, expect, it } from "vitest";
import { creditNoteRejectedTask, externalInvoicingTask } from "./fiscal-task.js";

const CREATED_AT = new Date("2026-10-02T15:00:00.000Z");

describe("externalInvoicingTask", () => {
  it("opens a task naming the voucher issued outside the register", () => {
    expect(
      externalInvoicingTask(
        {
          pointOfSale: 12,
          documentType: "factura_c",
          number: 41,
          voucher: { issuedOn: "2026-10-01", total: 12_500, authorizationCode: "75123456789012" },
        },
        CREATED_AT,
      ),
    ).toEqual({
      kind: "external_invoicing",
      state: "open",
      pointOfSale: 12,
      documentType: "factura_c",
      number: 41,
      voucher: { issuedOn: "2026-10-01", total: 12_500, authorizationCode: "75123456789012" },
      createdAt: CREATED_AT,
    });
  });
});

describe("creditNoteRejectedTask", () => {
  it("opens a task naming the rejected credit note and why it was rejected", () => {
    expect(
      creditNoteRejectedTask(
        {
          creditNoteId: "credit-note-1",
          pointOfSale: 12,
          number: 3,
          rejections: [{ code: 10015, message: "invalid receiver" }],
        },
        CREATED_AT,
      ),
    ).toEqual({
      kind: "credit_note_rejected",
      state: "open",
      pointOfSale: 12,
      documentType: "credit_note_c",
      number: 3,
      creditNoteId: "credit-note-1",
      rejections: [{ code: 10015, message: "invalid receiver" }],
      createdAt: CREATED_AT,
    });
  });
});
