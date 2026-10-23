import { describe, expect, expectTypeOf, it } from "vitest";
import type { DeferredSaleRegularizationTask } from "./deferred-sale-record.js";
import {
  CLOSED_FISCAL_TASK_STATE,
  creditNoteRejectedTask,
  externalInvoicingTask,
  FISCAL_TASK_CLOSING_NOTE_MAX_LENGTH,
  FISCAL_TASK_KINDS,
  FISCAL_TASK_STATES,
  type FiscalTask,
  type FiscalTaskKind,
  type FiscalTaskState,
  isFiscalTaskClosingNoteTooLong,
  OPEN_FISCAL_TASK_STATE,
} from "./fiscal-task.js";

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

describe("FISCAL_TASK_KINDS", () => {
  it("lists every kind of fiscal task, the expired deferred sale's included", () => {
    expect(FISCAL_TASK_KINDS).toEqual([
      "external_invoicing",
      "credit_note_rejected",
      "deferred_sale_expired",
    ]);
    expectTypeOf<FiscalTaskKind>().toEqualTypeOf<(typeof FISCAL_TASK_KINDS)[number]>();
    expectTypeOf<FiscalTaskKind>().toEqualTypeOf<
      FiscalTask["kind"] | DeferredSaleRegularizationTask["kind"]
    >();
  });
});

describe("fiscal task states", () => {
  it("is open until it is closed", () => {
    expect(FISCAL_TASK_STATES).toEqual(["open", "closed"]);
    expect(OPEN_FISCAL_TASK_STATE).toBe("open");
    expect(CLOSED_FISCAL_TASK_STATE).toBe("closed");
    expectTypeOf<FiscalTaskState>().toEqualTypeOf<(typeof FISCAL_TASK_STATES)[number]>();
    expectTypeOf<FiscalTask["state"]>().toEqualTypeOf<typeof OPEN_FISCAL_TASK_STATE>();
  });
});

describe("the closing note of a fiscal task", () => {
  it("allows at most 500 characters", () => {
    expect(FISCAL_TASK_CLOSING_NOTE_MAX_LENGTH).toBe(500);
  });


  it("accepts a note of exactly the maximum length and refuses one character more", () => {
    expect(isFiscalTaskClosingNoteTooLong("a".repeat(500))).toBe(false);
    expect(isFiscalTaskClosingNoteTooLong("a".repeat(501))).toBe(true);
  });

  it("counts characters outside the basic plane once", () => {
    expect(isFiscalTaskClosingNoteTooLong("😀".repeat(500))).toBe(false);
    expect(isFiscalTaskClosingNoteTooLong("😀".repeat(501))).toBe(true);
  });
});
