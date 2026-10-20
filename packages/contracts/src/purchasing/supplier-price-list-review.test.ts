import { describe, expect, it } from "vitest";
import { supplierPriceListReviewSchema } from "./supplier-price-list-review.js";

const row = {
  id: "row-1",
  description: "Yerba 1 kg",
  code: "Y-1",
  presentation: "Caja x 10",
  priceCents: 150_050,
  page: 3,
};
const bareRow = {
  id: "row-2",
  description: "Azucar 1 kg",
  code: null,
  presentation: null,
  priceCents: null,
  page: null,
};
const review = {
  list: {
    id: "list-1",
    supplier: { id: "s-1", name: "Distribuidora Sur" },
    sourceKind: "PDF",
    fileName: "lista-marzo.pdf",
    listDate: "2026-03-01",
    rowCount: 2,
    unpricedRowCount: 1,
    state: "EXTRACTED",
    readFailure: null,
    uploadedAt: "2026-03-01T12:00:00.000Z",
    replaced: false,
    version: 4,
  },
  rows: [row, bareRow],
};

describe("supplierPriceListReviewSchema", () => {
  it("accepts the list with a row that has everything and one that has nothing optional", () => {
    expect(supplierPriceListReviewSchema.safeParse(review).data).toEqual(review);
  });

  it("accepts a list without rows", () => {
    const empty = { ...review, rows: [] };

    expect(supplierPriceListReviewSchema.safeParse(empty).data).toEqual(empty);
  });

  it("requires the version the review changes are made against", () => {
    const { version: _version, ...list } = review.list;

    expect(supplierPriceListReviewSchema.safeParse({ ...review, list }).success).toBe(false);
  });

  it("strips keys it does not define from the rows", () => {
    const parsed = supplierPriceListReviewSchema.safeParse({
      ...review,
      rows: [{ ...row, position: 0 }],
    });

    expect(parsed.data?.rows).toEqual([row]);
  });

  it.each(Object.keys(row))("requires %s in a row", (field) => {
    const { [field as keyof typeof row]: _omitted, ...rest } = row;

    expect(supplierPriceListReviewSchema.safeParse({ ...review, rows: [rest] }).success).toBe(
      false,
    );
  });

  it.each([
    ["priceCents", 1.5],
    ["page", "3"],
    ["description", null],
    ["code", 7],
  ])("refuses a row with %s as %j", (field, value) => {
    expect(
      supplierPriceListReviewSchema.safeParse({ ...review, rows: [{ ...row, [field]: value }] })
        .success,
    ).toBe(false);
  });
});
