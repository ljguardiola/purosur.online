import type { StartupPending } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { hasStartupPendingItems, startupPendingMayChange } from "./startup-pending-items";

const NOTHING: StartupPending = {
  sales_to_print: [],
  unknown_fiscal_documents: [],
  pending_payments: [],
  paid_orders_without_sale: [],
  paid_order_discovery: "checked",
  selling_blocked: false,
  may_go_selling: true,
};

const A_PAID_ORDER: StartupPending["paid_orders_without_sale"][number] = {
  payment_transaction_id: "tx-1",
  sale_id: "sale-7",
  method: "QR",
  amount: 80_000,
  created_at: "2026-09-30T15:30:00.000Z",
};

describe("hasStartupPendingItems", () => {
  it("is false when the last run left nothing", () => {
    expect(hasStartupPendingItems(NOTHING)).toBe(false);
  });

  it("is true for a sale left to print", () => {
    expect(
      hasStartupPendingItems({
        ...NOTHING,
        sales_to_print: [
          {
            sale_id: "sale-1",
            completed_at: "2026-09-30T13:15:00.000Z",
            total: 123_450,
            standing: "never_printed",
          },
        ],
      }),
    ).toBe(true);
  });

  it("is true for a fiscal document whose outcome is unknown", () => {
    expect(
      hasStartupPendingItems({
        ...NOTHING,
        unknown_fiscal_documents: [
          {
            id: "doc-1",
            sale_id: "sale-3",
            completed_at: "2026-09-30T15:05:00.000Z",
            total: 50_000,
          },
        ],
      }),
    ).toBe(true);
  });

  it("is true for a payment still pending", () => {
    expect(
      hasStartupPendingItems({
        ...NOTHING,
        pending_payments: [
          {
            payment_id: "pay-1",
            sale_id: "sale-4",
            method: "QR",
            amount: 80_000,
            occurred_at: "2026-09-30T15:30:00.000Z",
          },
        ],
      }),
    ).toBe(true);
  });

  it("is true for a paid order without a sale", () => {
    expect(
      hasStartupPendingItems({
        ...NOTHING,
        paid_orders_without_sale: [A_PAID_ORDER],
        selling_blocked: true,
      }),
    ).toBe(true);
  });

  it("is true while the search for paid orders is not done, deferred or not run yet", () => {
    expect(hasStartupPendingItems({ ...NOTHING, paid_order_discovery: "deferred" })).toBe(true);
    expect(hasStartupPendingItems({ ...NOTHING, paid_order_discovery: "pending" })).toBe(true);
  });
});

describe("startupPendingMayChange", () => {
  it("is false when the last run left nothing and the search for paid orders is done", () => {
    expect(startupPendingMayChange(NOTHING)).toBe(false);
  });

  it.each([
    ["a paid order without a sale", { paid_orders_without_sale: [A_PAID_ORDER] }],
    ["a search for paid orders still pending", { paid_order_discovery: "pending" }],
    ["a search for paid orders deferred", { paid_order_discovery: "deferred" }],
    ["selling blocked", { selling_blocked: true }],
  ] satisfies [string, Partial<StartupPending>][])("is true with %s", (_name, change) => {
    expect(startupPendingMayChange({ ...NOTHING, ...change })).toBe(true);
  });
});
