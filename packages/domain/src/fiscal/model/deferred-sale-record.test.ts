import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DEFERRED_SALE_STATES,
  type DeferredSaleState,
  deferredSaleRegularizationTask,
  deferredSaleSettlement,
  EXPIRED_DEFERRED_SALE_STATE,
  FISCAL_TASK_KINDS,
  isUnbilledDeferredSale,
  PENDING_DEFERRED_SALE_STATE,
} from "./deferred-sale-record.js";
import type { FiscalTaskKind } from "./fiscal-task.js";

describe("deferred sale states", () => {
  it("lists every state a deferred sale can be in", () => {
    expect(DEFERRED_SALE_STATES).toEqual(["pending", "satisfied", "cancelled", "expired"]);
  });

  it("names the pending and the expired states the storage applies", () => {
    expect(PENDING_DEFERRED_SALE_STATE).toBe("pending");
    expect(EXPIRED_DEFERRED_SALE_STATE).toBe("expired");
  });
});

describe("isUnbilledDeferredSale", () => {
  it("is waiting to be invoiced while pending", () => {
    expect(isUnbilledDeferredSale({ state: "pending", regularizationTaskOpen: false })).toBe(true);
  });

  it("is waiting to be invoiced once expired while its regularization task is open", () => {
    expect(isUnbilledDeferredSale({ state: "expired", regularizationTaskOpen: true })).toBe(true);
  });

  it("is no longer waiting once expired with its task closed", () => {
    expect(isUnbilledDeferredSale({ state: "expired", regularizationTaskOpen: false })).toBe(false);
  });

  it.each(["satisfied", "cancelled"] as const)("is not waiting once %s", (state) => {
    expect(isUnbilledDeferredSale({ state, regularizationTaskOpen: false })).toBe(false);
  });

  it.each(["satisfied", "cancelled"] as const)(
    "is not waiting once %s, whatever its task says",
    (state) => {
      expect(isUnbilledDeferredSale({ state, regularizationTaskOpen: true })).toBe(false);
    },
  );
});

describe("deferredSaleSettlement", () => {
  it.each(["satisfied", "cancelled"] as const)("moves a pending sale to %s", (outcome) => {
    expect(deferredSaleSettlement("pending", outcome)).toEqual({
      state: outcome,
      closesRegularizationTask: false,
    });
  });

  it.each(["satisfied", "cancelled"] as const)(
    "moves an expired sale to %s and closes its regularization task",
    (outcome) => {
      expect(deferredSaleSettlement("expired", outcome)).toEqual({
        state: outcome,
        closesRegularizationTask: true,
      });
    },
  );

  it.each([
    ["satisfied", "satisfied"],
    ["satisfied", "cancelled"],
    ["cancelled", "satisfied"],
    ["cancelled", "cancelled"],
  ] as const)("leaves a %s sale as it is when it is %s again", (state, outcome) => {
    expect(deferredSaleSettlement(state, outcome)).toEqual({
      state,
      closesRegularizationTask: false,
    });
  });
});

describe("deferredSaleRegularizationTask", () => {
  it("is an open task naming the sale's register, date, total and short code", () => {
    const occurredAt = new Date("2026-10-10T15:00:00Z");
    const createdAt = new Date("2026-10-16T03:05:00Z");

    expect(
      deferredSaleRegularizationTask(
        {
          id: "deferred-sale-1",
          registerId: "register-1",
          occurredAt,
          total: 1234500,
          shortCode: "ABCD2345",
        },
        createdAt,
      ),
    ).toEqual({
      kind: "deferred_sale_expired",
      state: "open",
      deferredSaleId: "deferred-sale-1",
      registerId: "register-1",
      saleOccurredAt: occurredAt,
      total: 1234500,
      shortCode: "ABCD2345",
      createdAt,
    });
  });
});

describe("FISCAL_TASK_KINDS", () => {
  it("lists the kinds of fiscal task, including the expired deferred sale's", () => {
    expect(FISCAL_TASK_KINDS).toEqual([
      "external_invoicing",
      "credit_note_rejected",
      "deferred_sale_expired",
    ]);
    expectTypeOf<(typeof FISCAL_TASK_KINDS)[number]>().toEqualTypeOf<
      FiscalTaskKind | "deferred_sale_expired"
    >();
    expectTypeOf<DeferredSaleState>().toEqualTypeOf<(typeof DEFERRED_SALE_STATES)[number]>();
  });
});
