import type { StartupPending } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { hasStartupPendingItems } from "./startup-pending-items";

const NOTHING: StartupPending = {
  sales_to_print: [],
  unknown_fiscal_documents: [],
  pending_payments: [],
  paid_orders_without_sale: [],
  paid_order_discovery: "checked",
  selling_blocked: false,
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
});
