import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  PENDING_PURCHASE_ORDERS_DEFAULT_DAYS,
  pendingPurchaseOrders,
} from "./pending-purchase-orders-report.js";
import { aPendingOrderRow } from "./test-support/pending-purchase-order-row.js";

describe("PENDING_PURCHASE_ORDERS_DEFAULT_DAYS", () => {
  it("covers the last thirty days", () => {
    expect(PENDING_PURCHASE_ORDERS_DEFAULT_DAYS).toBe(30);
  });
});

describe("pendingPurchaseOrders", () => {
  it("reports no orders and zero totals for no pending orders", () => {
    expect(pendingPurchaseOrders([])).toEqual({
      orders: [],
      totals: { orders: 0, suppliers: 0, expectedTotalCents: 0, hasUnpricedLine: false },
    });
  });

  it("reports an order with its supplier, state, send date, line count and expected total", () => {
    const report = pendingPurchaseOrders([
      aPendingOrderRow({
        orderId: "order-7",
        state: "PARTIALLY_RECEIVED",
        lines: [
          { packages: 2, expectedPackagePriceCents: 1_500 },
          { packages: 1, expectedPackagePriceCents: 250 },
        ],
      }),
    ]);

    expect(report.orders).toEqual([
      {
        id: "order-7",
        supplier: { id: "supplier-1", name: "Distribuidora Norte" },
        state: "PARTIALLY_RECEIVED",
        sentAt: new Date("2026-10-01T15:00:00.000Z"),
        lineCount: 2,
        expectedTotalCents: 3_250,
        hasUnpricedLine: false,
      },
    ]);
  });

  it("flags an order with a line that has no expected price and leaves it out of the total", () => {
    const report = pendingPurchaseOrders([
      aPendingOrderRow({
        lines: [
          { packages: 2, expectedPackagePriceCents: 1_500 },
          { packages: 4, expectedPackagePriceCents: null },
        ],
      }),
    ]);

    expect(report.orders[0]).toMatchObject({ expectedTotalCents: 3_000, hasUnpricedLine: true });
    expect(report.totals).toMatchObject({ expectedTotalCents: 3_000, hasUnpricedLine: true });
  });

  it("orders the oldest sent first and breaks a tie by id", () => {
    const sentAt = new Date("2026-10-03T12:00:00.000Z");
    const report = pendingPurchaseOrders([
      aPendingOrderRow({ orderId: "b", sentAt }),
      aPendingOrderRow({ orderId: "c", sentAt: new Date("2026-10-02T12:00:00.000Z") }),
      aPendingOrderRow({ orderId: "a", sentAt }),
    ]);

    expect(report.orders.map(({ id }) => id)).toEqual(["c", "a", "b"]);
  });

  it("totals the orders, the distinct suppliers and the expected total", () => {
    const report = pendingPurchaseOrders([
      aPendingOrderRow({ orderId: "a", supplierId: "s1" }),
      aPendingOrderRow({ orderId: "b", supplierId: "s1" }),
      aPendingOrderRow({
        orderId: "c",
        supplierId: "s2",
        lines: [{ packages: 1, expectedPackagePriceCents: 100 }],
      }),
    ]);

    expect(report.totals).toEqual({
      orders: 3,
      suppliers: 2,
      expectedTotalCents: 6_100,
      hasUnpricedLine: false,
    });
  });

  it("does not change the rows it is given", () => {
    const rows = [aPendingOrderRow({ orderId: "b" }), aPendingOrderRow({ orderId: "a" })];

    pendingPurchaseOrders(rows);

    expect(rows.map(({ orderId }) => orderId)).toEqual(["b", "a"]);
  });

  it("reports every row once, in the same order whatever order the rows come in", () => {
    const rowArbitrary = fc.record({
      orderId: fc.uuid(),
      sentAt: fc.date({ noInvalidDate: true }),
      supplierId: fc.constantFrom("s1", "s2", "s3"),
    });

    fc.assert(
      fc.property(fc.uniqueArray(rowArbitrary, { selector: ({ orderId }) => orderId }), (rows) => {
        const built = rows.map((row) => aPendingOrderRow({ ...row, supplierName: row.supplierId }));

        const report = pendingPurchaseOrders(built);
        const reversed = pendingPurchaseOrders([...built].reverse());

        expect(report.orders).toEqual(reversed.orders);
        expect(report.orders).toHaveLength(rows.length);
        expect(report.totals.suppliers).toBe(
          new Set(rows.map(({ supplierId }) => supplierId)).size,
        );
      }),
    );
  });
});
