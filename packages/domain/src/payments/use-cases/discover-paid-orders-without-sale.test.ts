import { describe, expect, it } from "vitest";
import { discoverPaidOrdersWithoutSale } from "./discover-paid-orders-without-sale.js";
import { anApprovedOrder, NOW, paidOrderWorld } from "./test-support/fake-paid-order-world.js";

const NOTHING_FOUND = {
  kind: "checked",
  applied: 0,
  duplicateCharges: 0,
  withoutSale: 0,
  failed: 0,
};

describe("discoverPaidOrdersWithoutSale", () => {
  it("asks the cloud for the orders paid in the last 72 hours", async () => {
    const { cloud, ports } = paidOrderWorld();

    expect(await discoverPaidOrdersWithoutSale(ports)).toEqual(NOTHING_FOUND);

    expect(cloud.askedSince).toEqual([new Date("2026-10-10T12:00:00.000Z")]);
  });

  it("defers the check, recording and asking nothing, when the cloud cannot be reached", async () => {
    const { refunds, local, ports } = paidOrderWorld({ kind: "unreachable" });

    expect(await discoverPaidOrdersWithoutSale(ports)).toEqual({ kind: "deferred" });

    expect(local.recordedOrders.size).toBe(0);
    expect(local.applied).toEqual([]);
    expect(refunds.asked).toEqual([]);
  });

  it("leaves alone an order whose payment the register already approved", async () => {
    const order = anApprovedOrder();
    const { refunds, local, ports } = paidOrderWorld({ kind: "listed", orders: [order] });
    local.payments.set(order.paymentTransactionId, "APPROVED");
    local.sales.set(order.saleId, "COMPLETED");

    expect(await discoverPaidOrdersWithoutSale(ports)).toEqual(NOTHING_FOUND);

    expect(local.applied).toEqual([]);
    expect(local.recordedOrders.size).toBe(0);
    expect(refunds.asked).toEqual([]);
  });

  it("applies the paid order to the sale that is still open, charging nothing again", async () => {
    const order = anApprovedOrder();
    const { refunds, local, ports } = paidOrderWorld({ kind: "listed", orders: [order] });
    local.sales.set(order.saleId, "OPEN");

    expect(await discoverPaidOrdersWithoutSale(ports)).toEqual({ ...NOTHING_FOUND, applied: 1 });

    expect(local.applied).toEqual([order.paymentTransactionId]);
    expect(local.recordedOrders.size).toBe(0);
    expect(refunds.asked).toEqual([]);
  });

  it.each(["COMPLETED", "CANCELLED"] as const)(
    "asks the cloud to refund an order charged again for a %s sale",
    async (sale) => {
      const order = anApprovedOrder();
      const { refunds, local, ports } = paidOrderWorld({ kind: "listed", orders: [order] });
      local.sales.set(order.saleId, sale);

      expect(await discoverPaidOrdersWithoutSale(ports)).toEqual({
        ...NOTHING_FOUND,
        duplicateCharges: 1,
      });

      expect(refunds.pendingRefunds).toEqual([order.paymentTransactionId]);
      expect(local.recordedOrders.size).toBe(0);
      expect(local.applied).toEqual([]);
    },
  );

  it("counts a duplicate charge whose refund was already open", async () => {
    const order = anApprovedOrder();
    const { refunds, local, ports } = paidOrderWorld({ kind: "listed", orders: [order] });
    local.sales.set(order.saleId, "COMPLETED");

    await discoverPaidOrdersWithoutSale(ports);
    const again = await discoverPaidOrdersWithoutSale(ports);

    expect(again).toEqual({ ...NOTHING_FOUND, duplicateCharges: 1 });
    expect(refunds.pendingRefunds).toEqual([order.paymentTransactionId]);
  });

  it("records an order with no local sale as a paid order without a sale, when it was found", async () => {
    const order = anApprovedOrder();
    const { refunds, local, ports } = paidOrderWorld({ kind: "listed", orders: [order] });

    expect(await discoverPaidOrdersWithoutSale(ports)).toEqual({
      ...NOTHING_FOUND,
      withoutSale: 1,
    });

    expect(local.paidOrdersWithoutSale()).toEqual([{ ...order, recordedAt: NOW, resolved: false }]);
    expect(refunds.asked).toEqual([]);
  });

  it("records a paid order without a sale once, however many times it is discovered", async () => {
    const order = anApprovedOrder();
    const { local, ports } = paidOrderWorld({ kind: "listed", orders: [order] });

    await discoverPaidOrdersWithoutSale(ports);
    const again = await discoverPaidOrdersWithoutSale(ports);

    expect(again).toEqual(NOTHING_FOUND);
    expect(local.paidOrdersWithoutSale()).toHaveLength(1);
  });

  it("does not block selling again for an order the cashier already converted into a refund", async () => {
    const order = anApprovedOrder();
    const { local, ports } = paidOrderWorld({ kind: "listed", orders: [order] });
    await discoverPaidOrdersWithoutSale(ports);
    local.resolvePaidOrderWithoutSale(order.paymentTransactionId, NOW);

    await discoverPaidOrdersWithoutSale(ports);

    expect(local.paidOrdersWithoutSale().map(({ resolved }) => resolved)).toEqual([true]);
  });

  it("keeps checking the other orders when one fails", async () => {
    const failing = anApprovedOrder({ paymentTransactionId: "failing", saleId: "sale-failing" });
    const duplicate = anApprovedOrder({
      paymentTransactionId: "duplicate",
      saleId: "sale-duplicate",
    });
    const lost = anApprovedOrder({ paymentTransactionId: "lost", saleId: "sale-lost" });
    const { local, ports } = paidOrderWorld({
      kind: "listed",
      orders: [failing, duplicate, lost],
    });
    local.sales.set(failing.saleId, "OPEN");
    local.failingToApply.add(failing.paymentTransactionId);
    local.sales.set(duplicate.saleId, "COMPLETED");

    expect(await discoverPaidOrdersWithoutSale(ports)).toEqual({
      kind: "checked",
      applied: 0,
      duplicateCharges: 1,
      withoutSale: 1,
      failed: 1,
    });
  });

  it.each(["unreachable", "refused"] as const)(
    "counts as failed a duplicate charge whose refund the cloud answered %s, and goes on",
    async (answer) => {
      const duplicate = anApprovedOrder({ paymentTransactionId: "duplicate", saleId: "sale-1" });
      const lost = anApprovedOrder({ paymentTransactionId: "lost", saleId: "sale-2" });
      const { refunds, local, ports } = paidOrderWorld({
        kind: "listed",
        orders: [duplicate, lost],
      });
      local.sales.set("sale-1", "COMPLETED");
      refunds.answers.set("duplicate", { kind: answer });

      expect(await discoverPaidOrdersWithoutSale(ports)).toEqual({
        ...NOTHING_FOUND,
        withoutSale: 1,
        failed: 1,
      });
    },
  );
});
