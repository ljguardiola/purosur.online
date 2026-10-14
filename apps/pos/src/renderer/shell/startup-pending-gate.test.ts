import type { StartupPending } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { startupPendingGate } from "./startup-pending-gate";

const NOTHING: StartupPending = {
  sales_to_print: [],
  unknown_fiscal_documents: [],
  pending_payments: [],
  paid_orders_without_sale: [],
  paid_order_discovery: "checked",
  selling_blocked: false,
  may_go_selling: true,
};
const A_SALE_TO_PRINT: StartupPending = {
  ...NOTHING,
  sales_to_print: [
    {
      sale_id: "sale-1",
      completed_at: "2026-09-30T10:15:00.000-03:00",
      total: 123_450,
      standing: "never_printed",
    },
  ],
};
const A_FISCAL_DOCUMENT: StartupPending = {
  ...NOTHING,
  unknown_fiscal_documents: [
    {
      id: "doc-1",
      sale_id: "sale-2",
      completed_at: "2026-09-30T10:20:00.000-03:00",
      total: 50_000,
    },
  ],
};
const A_PAYMENT: StartupPending = {
  ...NOTHING,
  pending_payments: [
    {
      payment_id: "pay-1",
      sale_id: "sale-3",
      method: "QR",
      amount: 80_000,
      occurred_at: "2026-09-30T10:25:00.000-03:00",
    },
  ],
};

const A_PAID_ORDER_WITHOUT_SALE: StartupPending = {
  ...NOTHING,
  paid_orders_without_sale: [
    {
      payment_transaction_id: "tx-1",
      sale_id: "sale-7",
      method: "QR",
      amount: 80_000,
      created_at: "2026-09-30T10:30:00.000-03:00",
    },
  ],
  selling_blocked: true,
  may_go_selling: false,
};
const BLOCKED_WITH_AN_OPEN_SALE: StartupPending = {
  ...A_PAID_ORDER_WITHOUT_SALE,
  may_go_selling: true,
};
const DEFERRED_SEARCH: StartupPending = { ...NOTHING, paid_order_discovery: "deferred" };
const PENDING_SEARCH: StartupPending = { ...NOTHING, paid_order_discovery: "pending" };

describe("startupPendingGate", () => {
  it.each([
    ["a sale to print", A_SALE_TO_PRINT],
    ["an unknown fiscal document", A_FISCAL_DOCUMENT],
    ["a pending payment", A_PAYMENT],
    ["a paid order without a sale", A_PAID_ORDER_WITHOUT_SALE],
    ["a search for paid orders deferred", DEFERRED_SEARCH],
    ["a search for paid orders not run yet", PENDING_SEARCH],
  ])("lands on the pending screen when the core lists %s", async (_name, pending) => {
    const gate = startupPendingGate();

    expect(await gate.lands(async () => pending)).toBe(true);
    expect(gate.dismissed()).toBe(false);
  });

  it("keeps landing on the pending screen until it is dismissed", async () => {
    const gate = startupPendingGate();
    await gate.lands(async () => A_SALE_TO_PRINT);

    expect(await gate.lands(async () => A_SALE_TO_PRINT)).toBe(true);
  });

  it("goes on to selling once the core lists nothing, asking again the next time", async () => {
    const gate = startupPendingGate();
    const read = vi.fn(async () => NOTHING);

    expect(await gate.lands(read)).toBe(false);
    expect(await gate.lands(async () => A_SALE_TO_PRINT)).toBe(false);
    expect(await gate.lands(read)).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
    expect(gate.dismissed()).toBe(true);
  });

  it("goes on to selling when the person may not see what is pending", async () => {
    const gate = startupPendingGate();

    expect(await gate.lands(async () => "not_permitted")).toBe(false);
    expect(gate.dismissed()).toBe(true);
  });

  it("goes on to selling when the read fails", async () => {
    const gate = startupPendingGate();

    expect(
      await gate.lands(async () => {
        throw new Error("the core could not answer");
      }),
    ).toBe(false);
    expect(gate.dismissed()).toBe(true);
  });

  it("stops landing on the pending screen once dismissed", async () => {
    const gate = startupPendingGate();

    gate.dismiss();

    expect(await gate.lands(async () => A_SALE_TO_PRINT)).toBe(false);
    expect(gate.dismissed()).toBe(true);
  });

  it("keeps landing on the pending screen after being dismissed while selling is blocked", async () => {
    const gate = startupPendingGate();
    gate.dismiss();

    expect(await gate.lands(async () => A_PAID_ORDER_WITHOUT_SALE)).toBe(true);
    expect(gate.dismissed()).toBe(false);
  });

  it("does not let selling start while the core blocks it, even if the person had gone on to sell", async () => {
    const gate = startupPendingGate();
    await gate.lands(async () => NOTHING);

    expect(await gate.lands(async () => A_PAID_ORDER_WITHOUT_SALE)).toBe(true);
  });

  it("goes on to selling again once the paid order is no longer blocking", async () => {
    const gate = startupPendingGate();
    gate.dismiss();
    await gate.lands(async () => A_PAID_ORDER_WITHOUT_SALE);

    expect(await gate.lands(async () => NOTHING)).toBe(false);
    expect(gate.dismissed()).toBe(true);
  });

  it("still lands on the pending screen when the search not run yet turns out deferred", async () => {
    const gate = startupPendingGate();
    await gate.lands(async () => PENDING_SEARCH);

    expect(await gate.lands(async () => DEFERRED_SEARCH)).toBe(true);
  });

  it("lets the cashier go back to the sale left open while a paid order blocks starting another", async () => {
    const gate = startupPendingGate();
    expect(await gate.lands(async () => BLOCKED_WITH_AN_OPEN_SALE)).toBe(true);

    gate.dismiss();

    expect(gate.dismissed()).toBe(true);
    expect(await gate.lands(async () => BLOCKED_WITH_AN_OPEN_SALE)).toBe(false);
  });
});
