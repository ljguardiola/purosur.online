import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { receiptDifferences } from "./receipt-differences-report.js";
import { aReceiptLineRow } from "./test-support/receipt-line-row.js";

const short = { missingQuantity: 4_000 };
const dearer = { priceDifferenceCents: 250 };

describe("receiptDifferences", () => {
  it("reports no suppliers and zero totals when no receipt line differs", () => {
    const empty = {
      suppliers: [],
      totals: { suppliers: 0, shortLines: 0, priceDifferenceLines: 0, priceDifferenceCents: 0 },
    };

    expect(receiptDifferences([])).toEqual(empty);
    expect(
      receiptDifferences([
        aReceiptLineRow(),
        aReceiptLineRow({ priceDifferenceCents: 0, missingQuantity: 0 }),
      ]),
    ).toEqual(empty);
  });

  it("reports a line with its receipt, order, day, product and recorded quantities and difference", () => {
    const row = aReceiptLineRow({
      receiptId: "receipt-7",
      orderId: "order-3",
      receivedOn: "2026-10-05",
      receivedQuantity: 6_000,
      missingQuantity: 4_000,
      priceDifferenceCents: -120,
    });

    const report = receiptDifferences([row]);

    expect(report.suppliers).toEqual([
      {
        supplierId: "supplier-1",
        name: "Distribuidora Norte",
        shortLines: 1,
        priceDifferenceLines: 1,
        priceDifferenceCents: -120,
        months: [
          {
            month: "2026-10",
            shortLines: 1,
            priceDifferenceLines: 1,
            priceDifferenceCents: -120,
            lines: [
              {
                receiptId: "receipt-7",
                orderId: "order-3",
                receivedOn: "2026-10-05",
                receivedAt: row.receivedAt,
                product: row.product,
                receivedQuantity: 6_000,
                missingQuantity: 4_000,
                priceDifferenceCents: -120,
              },
            ],
          },
        ],
      },
    ]);
    expect(report.totals).toEqual({
      suppliers: 1,
      shortLines: 1,
      priceDifferenceLines: 1,
      priceDifferenceCents: -120,
    });
  });

  it("leaves out lines without a difference", () => {
    const report = receiptDifferences([
      aReceiptLineRow({ receiptId: "plain" }),
      aReceiptLineRow({ receiptId: "zero", priceDifferenceCents: 0 }),
      aReceiptLineRow({ receiptId: "short", ...short }),
    ]);

    expect(report.suppliers[0]?.months[0]?.lines.map(({ receiptId }) => receiptId)).toEqual([
      "short",
    ]);
  });

  it("counts shortfalls and price differences apart, and a line with both in each", () => {
    const report = receiptDifferences([
      aReceiptLineRow({ receiptId: "a", ...short }),
      aReceiptLineRow({ receiptId: "b", ...dearer }),
      aReceiptLineRow({ receiptId: "c", ...short, ...dearer }),
    ]);

    expect(report.suppliers[0]).toMatchObject({ shortLines: 2, priceDifferenceLines: 2 });
    expect(report.totals).toMatchObject({ shortLines: 2, priceDifferenceLines: 2 });
  });

  it("does not count a zero price difference as a price difference", () => {
    const report = receiptDifferences([aReceiptLineRow({ ...short, priceDifferenceCents: 0 })]);

    expect(report.suppliers[0]?.priceDifferenceLines).toBe(0);
    expect(report.totals.priceDifferenceLines).toBe(0);
  });

  it("nets the signed price differences and ignores lines without a list price", () => {
    const report = receiptDifferences([
      aReceiptLineRow({ receiptId: "a", priceDifferenceCents: 500 }),
      aReceiptLineRow({ receiptId: "b", priceDifferenceCents: -200 }),
      aReceiptLineRow({ receiptId: "c", priceDifferenceCents: null, ...short }),
    ]);

    expect(report.suppliers[0]?.priceDifferenceCents).toBe(300);
    expect(report.suppliers[0]?.months[0]?.priceDifferenceCents).toBe(300);
    expect(report.totals.priceDifferenceCents).toBe(300);
  });

  it("shows a shortfall that repeats on a later receipt again and never sums quantities", () => {
    const report = receiptDifferences([
      aReceiptLineRow({ receiptId: "first", receivedOn: "2026-10-01", ...short }),
      aReceiptLineRow({
        receiptId: "second",
        receivedOn: "2026-10-09",
        receivedQuantity: 2_000,
        missingQuantity: 2_000,
      }),
    ]);

    const lines = report.suppliers[0]?.months[0]?.lines;
    expect(lines?.map(({ receiptId, missingQuantity }) => [receiptId, missingQuantity])).toEqual([
      ["first", 4_000],
      ["second", 2_000],
    ]);
    expect(report.suppliers[0]?.shortLines).toBe(2);
  });

  it("groups each supplier's lines by the month of the receipt, oldest month first", () => {
    const report = receiptDifferences([
      aReceiptLineRow({ receiptId: "nov", receivedOn: "2026-11-02", ...short }),
      aReceiptLineRow({ receiptId: "oct", receivedOn: "2026-10-31", ...short }),
      aReceiptLineRow({ receiptId: "oct2", receivedOn: "2026-10-02", ...dearer }),
    ]);

    const months = report.suppliers[0]?.months;
    expect(months?.map(({ month }) => month)).toEqual(["2026-10", "2026-11"]);
    expect(months?.[0]).toMatchObject({ shortLines: 1, priceDifferenceLines: 1 });
    expect(months?.[1]).toMatchObject({ shortLines: 1, priceDifferenceLines: 0 });
    expect(months?.[0]?.lines.map(({ receiptId }) => receiptId)).toEqual(["oct2", "oct"]);
  });

  it("orders lines of the same day by when their receipt was received, whatever its id", () => {
    const report = receiptDifferences([
      aReceiptLineRow({
        receiptId: "r1",
        receivedAt: new Date("2026-10-01T18:00:00.000Z"),
        ...short,
      }),
      aReceiptLineRow({
        receiptId: "r2",
        receivedAt: new Date("2026-10-01T13:00:00.000Z"),
        ...short,
      }),
    ]);

    expect(report.suppliers[0]?.months[0]?.lines.map(({ receiptId }) => receiptId)).toEqual([
      "r2",
      "r1",
    ]);
  });

  it("orders lines received at the same instant by receipt and then by product", () => {
    const productOf = (id: string) => ({ ...aReceiptLineRow().product, id });
    const report = receiptDifferences([
      aReceiptLineRow({ receiptId: "r2", product: productOf("p1"), ...short }),
      aReceiptLineRow({ receiptId: "r1", product: productOf("p2"), ...short }),
      aReceiptLineRow({ receiptId: "r1", product: productOf("p1"), ...short }),
    ]);

    expect(
      report.suppliers[0]?.months[0]?.lines.map((line) => [line.receiptId, line.product.id]),
    ).toEqual([
      ["r1", "p1"],
      ["r1", "p2"],
      ["r2", "p1"],
    ]);
  });

  it("orders suppliers by name in Spanish and then by id, and counts them", () => {
    const report = receiptDifferences([
      aReceiptLineRow({ supplierId: "s3", supplierName: "Zeta", ...short }),
      aReceiptLineRow({ supplierId: "s2", supplierName: "Álamo", ...short }),
      aReceiptLineRow({ supplierId: "s1", supplierName: "Álamo", ...short }),
      aReceiptLineRow({ supplierId: "s4", supplierName: "Beta", ...short }),
    ]);

    expect(report.suppliers.map(({ supplierId }) => supplierId)).toEqual(["s1", "s2", "s4", "s3"]);
    expect(report.totals.suppliers).toBe(4);
  });

  it("leaves out suppliers whose lines all match", () => {
    const report = receiptDifferences([
      aReceiptLineRow({ supplierId: "ok", supplierName: "Sin diferencias" }),
      aReceiptLineRow({ supplierId: "bad", supplierName: "Con diferencias", ...short }),
    ]);

    expect(report.suppliers.map(({ supplierId }) => supplierId)).toEqual(["bad"]);
    expect(report.totals.suppliers).toBe(1);
  });

  it("totals add up the suppliers for any lines", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            supplierId: fc.constantFrom("s1", "s2", "s3"),
            missingQuantity: fc.integer({ min: 0, max: 5 }),
            priceDifferenceCents: fc.option(fc.integer({ min: -300, max: 300 }), { nil: null }),
          }),
        ),
        (rows) => {
          const report = receiptDifferences(
            rows.map((row) => aReceiptLineRow({ ...row, supplierName: row.supplierId })),
          );
          const sum = (pick: (supplier: (typeof report.suppliers)[number]) => number) =>
            report.suppliers.reduce((total, supplier) => total + pick(supplier), 0);

          expect(report.totals).toEqual({
            suppliers: report.suppliers.length,
            shortLines: sum((s) => s.shortLines),
            priceDifferenceLines: sum((s) => s.priceDifferenceLines),
            priceDifferenceCents: sum((s) => s.priceDifferenceCents),
          });
        },
      ),
    );
  });
});
