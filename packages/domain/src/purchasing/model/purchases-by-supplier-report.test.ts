import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type PurchasedLine, purchasesBySupplier } from "./purchases-by-supplier-report.js";

function aLine(overrides: Partial<PurchasedLine> = {}): PurchasedLine {
  return {
    purchaseId: "purchase-1",
    supplierId: "supplier-1",
    supplierName: "Distribuidora Norte",
    purchasedOn: "2026-10-06",
    costPaidCents: 1_000,
    quantity: 1_000,
    quantityPerPackage: 1_000,
    ...overrides,
  };
}

describe("purchasesBySupplier", () => {
  it("reports no suppliers and zero totals for no purchases", () => {
    expect(purchasesBySupplier([])).toEqual({
      suppliers: [],
      totals: { suppliers: 0, purchases: 0, amount: 0 },
    });
  });

  it("reports a supplier's month with its purchases and amount", () => {
    const report = purchasesBySupplier([
      aLine({ purchaseId: "a", costPaidCents: 1_000, quantity: 2_000 }),
      aLine({ purchaseId: "b", costPaidCents: 250 }),
    ]);

    expect(report.suppliers).toEqual([
      {
        supplierId: "supplier-1",
        name: "Distribuidora Norte",
        months: [{ month: "2026-10", purchases: 2, amount: 2_250 }],
        purchases: 2,
        amount: 2_250,
      },
    ]);
  });

  it("counts a purchase once however many lines it has", () => {
    const report = purchasesBySupplier([
      aLine({ purchaseId: "a", costPaidCents: 100 }),
      aLine({ purchaseId: "a", costPaidCents: 200 }),
      aLine({ purchaseId: "a", costPaidCents: 300 }),
    ]);

    expect(report.suppliers[0]?.months).toEqual([{ month: "2026-10", purchases: 1, amount: 600 }]);
    expect(report.suppliers[0]?.purchases).toBe(1);
    expect(report.totals).toEqual({ suppliers: 1, purchases: 1, amount: 600 });
  });

  it("values a line by the packages bought times the cost paid per package", () => {
    const report = purchasesBySupplier([
      aLine({ costPaidCents: 1_200, quantity: 24_000, quantityPerPackage: 12_000 }),
    ]);

    expect(report.totals.amount).toBe(2_400);
  });

  it("splits a supplier's purchases by the calendar month of the purchase day", () => {
    const report = purchasesBySupplier([
      aLine({ purchaseId: "a", purchasedOn: "2026-09-30", costPaidCents: 100 }),
      aLine({ purchaseId: "b", purchasedOn: "2026-10-01", costPaidCents: 200 }),
      aLine({ purchaseId: "c", purchasedOn: "2026-10-31", costPaidCents: 400 }),
    ]);

    expect(report.suppliers[0]?.months).toEqual([
      { month: "2026-09", purchases: 1, amount: 100 },
      { month: "2026-10", purchases: 2, amount: 600 },
    ]);
    expect(report.suppliers[0]).toMatchObject({ purchases: 3, amount: 700 });
  });

  it("orders each supplier's months from the earliest", () => {
    const report = purchasesBySupplier([
      aLine({ purchaseId: "a", purchasedOn: "2026-12-02" }),
      aLine({ purchaseId: "b", purchasedOn: "2026-10-02" }),
      aLine({ purchaseId: "c", purchasedOn: "2027-01-02" }),
      aLine({ purchaseId: "d", purchasedOn: "2026-11-02" }),
    ]);

    expect(report.suppliers[0]?.months.map(({ month }) => month)).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("keeps the suppliers apart and orders them by name in Spanish, then by id", () => {
    const report = purchasesBySupplier([
      aLine({ purchaseId: "a", supplierId: "s-3", supplierName: "Zeta" }),
      aLine({ purchaseId: "b", supplierId: "s-2", supplierName: "Álamo" }),
      aLine({ purchaseId: "c", supplierId: "s-5", supplierName: "Bodega" }),
      aLine({ purchaseId: "d", supplierId: "s-4", supplierName: "Bodega" }),
    ]);

    expect(report.suppliers.map(({ supplierId }) => supplierId)).toEqual([
      "s-2",
      "s-4",
      "s-5",
      "s-3",
    ]);
    expect(report.totals).toMatchObject({ suppliers: 4, purchases: 4 });
  });

  it("rounds a month's exact amount to cents once, half up", () => {
    const report = purchasesBySupplier([
      aLine({ purchaseId: "a", costPaidCents: 333, quantity: 2_500, quantityPerPackage: 1_000 }),
      aLine({ purchaseId: "b", costPaidCents: 333, quantity: 2_500, quantityPerPackage: 1_000 }),
      aLine({ purchaseId: "c", costPaidCents: 1, quantity: 1_000, quantityPerPackage: 3_000 }),
    ]);

    expect(report.suppliers[0]?.months[0]?.amount).toBe(1_665);
  });

  it("rounds each month, each supplier and the grand total from their own exact sums", () => {
    const half = { costPaidCents: 1, quantity: 1_000, quantityPerPackage: 2_000 };
    const report = purchasesBySupplier([
      aLine({ purchaseId: "a", purchasedOn: "2026-09-10", ...half }),
      aLine({ purchaseId: "b", purchasedOn: "2026-10-10", ...half }),
    ]);

    expect(report.suppliers[0]?.months).toEqual([
      { month: "2026-09", purchases: 1, amount: 1 },
      { month: "2026-10", purchases: 1, amount: 1 },
    ]);
    expect(report.suppliers[0]?.amount).toBe(1);
    expect(report.totals.amount).toBe(1);
  });

  it("rounds the grand total across suppliers from the exact sum, not from the rounded suppliers", () => {
    const third = { costPaidCents: 1, quantity: 1_000, quantityPerPackage: 3_000 };
    const report = purchasesBySupplier([
      aLine({ purchaseId: "a", supplierId: "s-1", supplierName: "A", ...third }),
      aLine({ purchaseId: "b", supplierId: "s-2", supplierName: "B", ...third }),
      aLine({ purchaseId: "c", supplierId: "s-3", supplierName: "C", ...third }),
    ]);

    expect(report.suppliers.map(({ amount }) => amount)).toEqual([0, 0, 0]);
    expect(report.totals.amount).toBe(1);
  });

  it("does not change the lines it is given", () => {
    const lines = [
      aLine({ purchaseId: "a", supplierName: "Zeta", supplierId: "s-2" }),
      aLine({ purchaseId: "b", supplierName: "Alfa", supplierId: "s-1" }),
    ];

    purchasesBySupplier(lines);

    expect(lines.map(({ purchaseId }) => purchaseId)).toEqual(["a", "b"]);
  });

  it("keeps the supplier totals equal to the sum of their months' purchases and the grand total of theirs", () => {
    const lineArbitrary = fc.record({
      purchaseId: fc.constantFrom("p1", "p2", "p3", "p4"),
      supplierId: fc.constantFrom("s1", "s2"),
      purchasedOn: fc.constantFrom("2026-09-30", "2026-10-01", "2026-11-15"),
      costPaidCents: fc.integer({ min: 0, max: 100_000 }),
      quantity: fc.integer({ min: 1, max: 50_000 }),
      quantityPerPackage: fc.integer({ min: 1, max: 12_000 }),
    });

    fc.assert(
      fc.property(fc.array(lineArbitrary, { maxLength: 12 }), (records) => {
        const lines = records.map((record) => ({
          ...record,
          supplierName: record.supplierId === "s1" ? "Norte" : "Sur",
          purchaseId: `${record.supplierId}-${record.purchasedOn}-${record.purchaseId}`,
        }));

        const report = purchasesBySupplier(lines);

        expect(report.totals.purchases).toBe(
          new Set(lines.map(({ purchaseId }) => purchaseId)).size,
        );
        for (const supplier of report.suppliers) {
          expect(supplier.purchases).toBe(
            supplier.months.reduce((sum, { purchases }) => sum + purchases, 0),
          );
        }
      }),
    );
  });
});
