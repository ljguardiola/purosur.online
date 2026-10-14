import { describe, expect, it } from "vitest";
import { readPaidOrdersWithoutSale } from "./read-paid-orders-without-sale.js";
import { anApprovedOrder, NOW, paidOrderWorld } from "./test-support/fake-paid-order-world.js";

describe("readPaidOrdersWithoutSale", () => {
  it("does not block selling when the register has none", () => {
    const { ports } = paidOrderWorld();

    expect(readPaidOrdersWithoutSale(ports)).toEqual({
      kind: "read",
      paidOrders: [],
      sellingBlocked: false,
    });
  });

  it("lists the unresolved ones and blocks selling", () => {
    const { local, ports } = paidOrderWorld();
    const order = anApprovedOrder();
    local.recordPaidOrderWithoutSale(order, NOW);

    expect(readPaidOrdersWithoutSale(ports)).toEqual({
      kind: "read",
      paidOrders: [{ ...order, recordedAt: NOW, resolved: false }],
      sellingBlocked: true,
    });
  });

  it("leaves out the resolved ones and stops blocking once all are resolved", () => {
    const { local, ports } = paidOrderWorld();
    local.recordPaidOrderWithoutSale(anApprovedOrder(), NOW);
    local.resolvePaidOrderWithoutSale("payment-1", NOW);

    expect(readPaidOrdersWithoutSale(ports)).toEqual({
      kind: "read",
      paidOrders: [],
      sellingBlocked: false,
    });
  });

  it("keeps blocking while one of several is still unresolved", () => {
    const { local, ports } = paidOrderWorld();
    local.recordPaidOrderWithoutSale(anApprovedOrder(), NOW);
    local.recordPaidOrderWithoutSale(
      anApprovedOrder({ paymentTransactionId: "payment-2", saleId: "sale-2" }),
      NOW,
    );
    local.resolvePaidOrderWithoutSale("payment-1", NOW);

    const read = readPaidOrdersWithoutSale(ports);

    expect(read.paidOrders.map((paidOrder) => paidOrder.paymentTransactionId)).toEqual([
      "payment-2",
    ]);
    expect(read.sellingBlocked).toBe(true);
  });
});
