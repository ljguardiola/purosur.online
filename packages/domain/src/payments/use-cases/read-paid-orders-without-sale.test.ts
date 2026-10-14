import { describe, expect, it } from "vitest";
import { readPaidOrdersWithoutSale } from "./read-paid-orders-without-sale.js";
import { anApprovedOrder, NOW, paidOrderWorld } from "./test-support/fake-paid-order-world.js";

const NO_OPEN_SALE = { openSale: false, discovery: "checked" } as const;

describe("readPaidOrdersWithoutSale", () => {
  it("does not block selling when the register has none", () => {
    const { ports } = paidOrderWorld();

    expect(readPaidOrdersWithoutSale(ports, NO_OPEN_SALE)).toEqual({
      kind: "read",
      paidOrders: [],
      sellingBlocked: false,
      mayGoSelling: true,
    });
  });

  it("lists the unresolved ones and blocks selling", () => {
    const { local, ports } = paidOrderWorld();
    const order = anApprovedOrder();
    local.recordPaidOrderWithoutSale(order, NOW);

    expect(readPaidOrdersWithoutSale(ports, NO_OPEN_SALE)).toEqual({
      kind: "read",
      paidOrders: [{ ...order, recordedAt: NOW, resolved: false }],
      sellingBlocked: true,
      mayGoSelling: false,
    });
  });

  it("lets the cashier go back to the sale already open while one blocks starting another", () => {
    const { local, ports } = paidOrderWorld();
    local.recordPaidOrderWithoutSale(anApprovedOrder(), NOW);

    const read = readPaidOrdersWithoutSale(ports, { openSale: true, discovery: "checked" });

    expect([read.sellingBlocked, read.mayGoSelling]).toEqual([true, true]);
  });

  it("leaves out the resolved ones and stops blocking once all are resolved", () => {
    const { local, ports } = paidOrderWorld();
    local.recordPaidOrderWithoutSale(anApprovedOrder(), NOW);
    local.resolvePaidOrderWithoutSale("payment-1", NOW);

    expect(readPaidOrdersWithoutSale(ports, NO_OPEN_SALE)).toEqual({
      kind: "read",
      paidOrders: [],
      sellingBlocked: false,
      mayGoSelling: true,
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

    const read = readPaidOrdersWithoutSale(ports, NO_OPEN_SALE);

    expect(read.paidOrders.map((paidOrder) => paidOrder.paymentTransactionId)).toEqual([
      "payment-2",
    ]);
    expect(read.sellingBlocked).toBe(true);
    expect(read.mayGoSelling).toBe(false);
  });

  it("keeps the cashier from starting a sale while this run's check waits for the cloud", () => {
    const { ports } = paidOrderWorld();

    expect(readPaidOrdersWithoutSale(ports, { openSale: false, discovery: "pending" })).toEqual({
      kind: "read",
      paidOrders: [],
      sellingBlocked: false,
      mayGoSelling: false,
    });
  });

  it("lets the cashier go back to the sale already open while the check waits for the cloud", () => {
    const { ports } = paidOrderWorld();

    const read = readPaidOrdersWithoutSale(ports, { openSale: true, discovery: "pending" });

    expect(read.mayGoSelling).toBe(true);
  });

  it("lets the cashier start a sale once the check is deferred", () => {
    const { ports } = paidOrderWorld();

    const read = readPaidOrdersWithoutSale(ports, { openSale: false, discovery: "deferred" });

    expect(read.mayGoSelling).toBe(true);
  });
});
