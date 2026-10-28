import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ISSUED_DOCUMENT_STATES } from "./issued-fiscal-document.js";
import {
  COUNTED_AS_ISSUED_STATE,
  ISSUED_AUTHORIZATION_KINDS,
  type IssuedDocumentGroup,
  issuedFiscalDocumentsReport,
} from "./issued-fiscal-documents-report.js";

function group(overrides: Partial<IssuedDocumentGroup> = {}): IssuedDocumentGroup {
  return {
    kind: "receipt",
    voucherType: 11,
    pointOfSale: 7,
    authorizationKind: "cae",
    count: 1,
    amount: 1_000,
    ...overrides,
  };
}

const anyGroup = fc.record({
  kind: fc.constantFrom("receipt", "credit_note"),
  voucherType: fc.integer({ min: 1, max: 20 }),
  pointOfSale: fc.integer({ min: 1, max: 9 }),
  authorizationKind: fc.constantFrom(...ISSUED_AUTHORIZATION_KINDS),
  count: fc.integer({ min: 1, max: 1_000 }),
  amount: fc.integer({ min: 0, max: 10_000_000 }),
});

describe("COUNTED_AS_ISSUED_STATE", () => {
  it("is one of the states a listed document can be in", () => {
    expect(ISSUED_DOCUMENT_STATES).toContain(COUNTED_AS_ISSUED_STATE);
  });

  it("is the authorized state", () => {
    expect(COUNTED_AS_ISSUED_STATE).toBe("authorized");
  });
});

describe("issuedFiscalDocumentsReport", () => {
  it("reports nothing issued for no group", () => {
    expect(issuedFiscalDocumentsReport([])).toEqual({
      rows: [],
      totals: {
        receipts: { count: 0, amount: 0 },
        creditNotes: { count: 0, amount: 0 },
        amount: 0,
        contingency: { count: 0, shareTenthsOfPercent: null },
      },
    });
  });

  it("shows a receipt group with its amount as it is", () => {
    const { rows } = issuedFiscalDocumentsReport([group({ count: 3, amount: 4_800 })]);

    expect(rows).toEqual([
      {
        kind: "receipt",
        voucherType: 11,
        pointOfSale: 7,
        authorizationKind: "cae",
        count: 3,
        amount: 4_800,
      },
    ]);
  });

  it("shows a credit note group with its amount subtracting", () => {
    const { rows } = issuedFiscalDocumentsReport([
      group({ kind: "credit_note", voucherType: 13, count: 2, amount: 1_500 }),
    ]);

    expect(rows).toMatchObject([{ kind: "credit_note", count: 2, amount: -1_500 }]);
  });

  it("totals receipts and credit notes apart, and the net amount subtracts the credit notes", () => {
    const { totals } = issuedFiscalDocumentsReport([
      group({ count: 2, amount: 6_000 }),
      group({ authorizationKind: "caea", count: 1, amount: 2_000 }),
      group({ kind: "credit_note", voucherType: 13, count: 1, amount: 1_500 }),
      group({
        kind: "credit_note",
        voucherType: 13,
        authorizationKind: "caea",
        count: 1,
        amount: 500,
      }),
    ]);

    expect(totals).toMatchObject({
      receipts: { count: 3, amount: 8_000 },
      creditNotes: { count: 2, amount: -2_000 },
      amount: 6_000,
    });
  });

  it("counts under contingency the documents of both kinds issued under a CAEA", () => {
    const { totals } = issuedFiscalDocumentsReport([
      group({ count: 4, amount: 100 }),
      group({ authorizationKind: "caea", count: 2, amount: 100 }),
      group({ kind: "credit_note", voucherType: 13, authorizationKind: "caea", count: 1 }),
      group({ kind: "credit_note", voucherType: 13, count: 1 }),
    ]);

    expect(totals.contingency).toEqual({ count: 3, shareTenthsOfPercent: 375 });
  });

  it.each([
    [1, 3, 333],
    [2, 3, 667],
    [1, 8, 125],
    [1, 16, 63],
    [0, 5, 0],
    [5, 5, 1_000],
  ])(
    "rounds the share of %i CAEA documents among %i to %i tenths of a percent",
    (caea, all, tenths) => {
      const groups = [
        group({ authorizationKind: "caea", count: caea }),
        group({ count: all - caea }),
      ].filter((each) => each.count > 0);

      const { totals } = issuedFiscalDocumentsReport(groups);

      expect(totals.contingency.shareTenthsOfPercent).toBe(tenths);
    },
  );

  it("sorts the rows by voucher type, then point of sale, then CAE before CAEA", () => {
    const { rows } = issuedFiscalDocumentsReport([
      group({ kind: "credit_note", voucherType: 13, pointOfSale: 2 }),
      group({ voucherType: 11, pointOfSale: 9, authorizationKind: "caea" }),
      group({ voucherType: 11, pointOfSale: 9, authorizationKind: "cae" }),
      group({ voucherType: 11, pointOfSale: 3, authorizationKind: "caea" }),
    ]);

    expect(
      rows.map(({ voucherType, pointOfSale, authorizationKind }) => [
        voucherType,
        pointOfSale,
        authorizationKind,
      ]),
    ).toEqual([
      [11, 3, "caea"],
      [11, 9, "cae"],
      [11, 9, "caea"],
      [13, 2, "cae"],
    ]);
  });

  it("does not change the groups it is given", () => {
    const groups = [group({ pointOfSale: 9 }), group({ pointOfSale: 3 })];

    issuedFiscalDocumentsReport(groups);

    expect(groups.map((each) => each.pointOfSale)).toEqual([9, 3]);
  });

  it("keeps one row for each group and counts every document of them all", () => {
    fc.assert(
      fc.property(fc.array(anyGroup, { maxLength: 12 }), (groups) => {
        const { rows, totals } = issuedFiscalDocumentsReport(groups);

        expect(rows).toHaveLength(groups.length);
        expect(totals.receipts.count + totals.creditNotes.count).toBe(
          groups.reduce((sum, each) => sum + each.count, 0),
        );
      }),
    );
  });

  it("always adds up the net amount of the rows and keeps credit notes non-positive", () => {
    fc.assert(
      fc.property(fc.array(anyGroup, { maxLength: 12 }), (groups) => {
        const { rows, totals } = issuedFiscalDocumentsReport(groups);

        expect(totals.amount).toBe(rows.reduce((sum, row) => sum + row.amount, 0));
        expect(totals.amount).toBe(totals.receipts.amount + totals.creditNotes.amount);
        expect(totals.receipts.amount).toBeGreaterThanOrEqual(0);
        expect(totals.creditNotes.amount).toBeLessThanOrEqual(0);
      }),
    );
  });

  it("keeps the share between none and all of the documents", () => {
    fc.assert(
      fc.property(fc.array(anyGroup, { minLength: 1, maxLength: 12 }), (groups) => {
        const { shareTenthsOfPercent } = issuedFiscalDocumentsReport(groups).totals.contingency;

        expect(shareTenthsOfPercent).toBeGreaterThanOrEqual(0);
        expect(shareTenthsOfPercent).toBeLessThanOrEqual(1_000);
      }),
    );
  });
});
