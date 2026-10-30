import { describe, expect, it } from "vitest";
import { supplierPriceListReviewSchema } from "./supplier-price-list-review.js";

const row = {
  id: "row-1",
  description: "Yerba 1 kg",
  code: "Y-1",
  presentation: "Caja x 10",
  priceCents: 150_050,
  page: 3,
  barcode: "7790001000012",
  link: {
    product: {
      id: "p-1",
      name: "Yerba Piragüé",
      brandName: "Piragüé",
      netContent: { quantity: 1, unit: "KG" },
      saleUnit: "UNIT",
    },
    packaging: { id: "pk-1", name: "Caja x 10", quantityPerPackage: 10_000, buyable: true },
    vatRate: 1050,
  },
  status: "price_changed",
  mayCreateProduct: false,
  needsReview: true,
  previousPriceCents: 140_000,
  pricePerSaleUnit: { numerator: "165805", denominator: "10" },
};
const bareRow = {
  id: "row-2",
  description: "Azucar 1 kg",
  code: null,
  presentation: null,
  priceCents: null,
  page: null,
  barcode: null,
  link: null,
  status: "new",
  mayCreateProduct: true,
  needsReview: true,
  previousPriceCents: null,
  pricePerSaleUnit: null,
};
const review = {
  list: {
    id: "list-1",
    supplier: { id: "s-1", name: "Distribuidora Sur" },
    source: { kind: "PDF", fileName: "lista-marzo.pdf" },
    listDate: "2026-03-01",
    rowCount: 2,
    unpricedRowCount: 1,
    state: "EXTRACTED",
    readFailure: null,
    rereading: false,
    lastRereadFailure: null,
    uploadedAt: "2026-03-01T12:00:00.000Z",
    replaced: false,
    version: 4,
    pricesIncludeVat: true,
    requiresVatRate: false,
  },
  rows: [row, bareRow],
  counts: { needingReview: 2, linkedAutomatically: 0 },
  actions: {
    changeRows: true,
    confirm: true,
    discard: true,
    linkRows: true,
    markRowsReviewed: true,
  },
};

describe("supplierPriceListReviewSchema", () => {
  it("accepts the list with a row that has everything and one that has nothing optional", () => {
    expect(supplierPriceListReviewSchema.safeParse(review).data).toEqual(review);
  });

  it("accepts a list read from a web page", () => {
    const fromWebPage = {
      ...review,
      list: {
        ...review.list,
        source: { kind: "WEB_PAGE", url: "https://distribuidora-sur.example/lista" },
      },
    };

    expect(supplierPriceListReviewSchema.safeParse(fromWebPage).data).toEqual(fromWebPage);
  });

  it("accepts a list without rows", () => {
    const empty = { ...review, rows: [] };

    expect(supplierPriceListReviewSchema.safeParse(empty).data).toEqual(empty);
  });

  it("requires each row to say whether it needs review", () => {
    const { needsReview: _needsReview, ...unmarked } = bareRow;

    expect(supplierPriceListReviewSchema.safeParse({ ...review, rows: [unmarked] }).success).toBe(
      false,
    );
  });

  it("requires each row to say whether a product may be created from it", () => {
    const { mayCreateProduct: _mayCreateProduct, ...unmarked } = bareRow;

    expect(supplierPriceListReviewSchema.safeParse({ ...review, rows: [unmarked] }).success).toBe(
      false,
    );
    expect(
      supplierPriceListReviewSchema.safeParse({
        ...review,
        rows: [{ ...bareRow, mayCreateProduct: "yes" }],
      }).success,
    ).toBe(false);
  });

  it("requires the version the review changes are made against", () => {
    const { version: _version, ...list } = review.list;

    expect(supplierPriceListReviewSchema.safeParse({ ...review, list }).success).toBe(false);
  });

  it.each([true, false, null])(
    "accepts a list whose prices include VAT: %s",
    (pricesIncludeVat) => {
      const withVat = { ...review, list: { ...review.list, pricesIncludeVat } };

      expect(supplierPriceListReviewSchema.safeParse(withVat).data).toEqual(withVat);
    },
  );

  it("requires whether the prices include VAT, even if not known yet", () => {
    const { pricesIncludeVat: _pricesIncludeVat, ...list } = review.list;

    expect(supplierPriceListReviewSchema.safeParse({ ...review, list }).success).toBe(false);
    expect(
      supplierPriceListReviewSchema.safeParse({
        ...review,
        list: { ...review.list, pricesIncludeVat: "yes" },
      }).success,
    ).toBe(false);
  });

  it("requires which actions the list allows", () => {
    const { actions: _actions, ...withoutActions } = review;

    expect(supplierPriceListReviewSchema.safeParse(withoutActions).success).toBe(false);
  });

  it.each(["changeRows", "confirm", "discard", "linkRows", "markRowsReviewed"])(
    "requires whether the list allows %s",
    (action) => {
      const { [action as keyof typeof review.actions]: _omitted, ...actions } = review.actions;

      expect(supplierPriceListReviewSchema.safeParse({ ...review, actions }).success).toBe(false);
      expect(
        supplierPriceListReviewSchema.safeParse({
          ...review,
          actions: { ...review.actions, [action]: "yes" },
        }).success,
      ).toBe(false);
    },
  );

  it("requires whether the links of the list need a VAT rate", () => {
    const { requiresVatRate: _requiresVatRate, ...list } = review.list;

    expect(supplierPriceListReviewSchema.safeParse({ ...review, list }).success).toBe(false);
    expect(
      supplierPriceListReviewSchema.safeParse({
        ...review,
        list: { ...review.list, requiresVatRate: "yes" },
      }).success,
    ).toBe(false);
  });

  it("requires whether the linked packaging may still be bought by", () => {
    const { buyable: _buyable, ...packaging } = row.link.packaging;

    expect(
      supplierPriceListReviewSchema.safeParse({
        ...review,
        rows: [{ ...row, link: { ...row.link, packaging } }],
      }).success,
    ).toBe(false);
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

  it.each([
    "new",
    "linked",
    "price_changed",
    "description_changed",
    "unlinked",
    "vat_rate_missing",
    "reviewed",
  ])("accepts the row status %s", (status) => {
    const withStatus = { ...review, rows: [{ ...row, status }] };

    expect(supplierPriceListReviewSchema.safeParse(withStatus).data).toEqual(withStatus);
  });

  it.each(["", "Linked", "changed", null, 1])("refuses the row status %j", (status) => {
    expect(
      supplierPriceListReviewSchema.safeParse({ ...review, rows: [{ ...row, status }] }).success,
    ).toBe(false);
  });

  it.each(["UNIT", "KG"])("accepts a link to a product sold by %s", (saleUnit) => {
    const linked = {
      ...review,
      rows: [{ ...row, link: { ...row.link, product: { ...row.link.product, saleUnit } } }],
    };

    expect(supplierPriceListReviewSchema.safeParse(linked).data).toEqual(linked);
  });

  it("refuses a link to a product sold by an unknown unit", () => {
    const linked = {
      ...review,
      rows: [{ ...row, link: { ...row.link, product: { ...row.link.product, saleUnit: "BOX" } } }],
    };

    expect(supplierPriceListReviewSchema.safeParse(linked).success).toBe(false);
  });

  it("accepts a linked product without a brand or a net content", () => {
    const linked = {
      ...review,
      rows: [
        {
          ...row,
          link: {
            ...row.link,
            product: { ...row.link.product, brandName: null, netContent: null },
          },
        },
      ],
    };

    expect(supplierPriceListReviewSchema.safeParse(linked).data).toEqual(linked);
  });

  it.each(["brandName", "netContent"])("requires a linked product's %s", (field) => {
    const { [field as keyof typeof row.link.product]: _omitted, ...product } = row.link.product;

    expect(
      supplierPriceListReviewSchema.safeParse({
        ...review,
        rows: [{ ...row, link: { ...row.link, product } }],
      }).success,
    ).toBe(false);
  });

  it("accepts a link without a VAT rate", () => {
    const linked = { ...review, rows: [{ ...row, link: { ...row.link, vatRate: null } }] };

    expect(supplierPriceListReviewSchema.safeParse(linked).data).toEqual(linked);
  });

  it.each(["product", "packaging", "vatRate"])("requires %s in a link", (field) => {
    const { [field as keyof typeof row.link]: _omitted, ...link } = row.link;

    expect(
      supplierPriceListReviewSchema.safeParse({ ...review, rows: [{ ...row, link }] }).success,
    ).toBe(false);
  });

  it.each([
    ["numerator", "1.5"],
    ["numerator", "-1"],
    ["numerator", 5],
    ["denominator", "0"],
    ["denominator", "-3"],
    ["denominator", ""],
  ])("refuses a price per sale unit with the %s %j", (field, value) => {
    expect(
      supplierPriceListReviewSchema.safeParse({
        ...review,
        rows: [{ ...row, pricePerSaleUnit: { numerator: "1", denominator: "1", [field]: value } }],
      }).success,
    ).toBe(false);
  });

  it("refuses a previous price that is not a whole number of cents", () => {
    expect(
      supplierPriceListReviewSchema.safeParse({
        ...review,
        rows: [{ ...row, previousPriceCents: 1.5 }],
      }).success,
    ).toBe(false);
  });

  it.each(["needingReview", "linkedAutomatically"])("requires the count %s", (field) => {
    const { [field as keyof typeof review.counts]: _omitted, ...counts } = review.counts;

    expect(supplierPriceListReviewSchema.safeParse({ ...review, counts }).success).toBe(false);
  });

  it("requires the counts of the footer", () => {
    const { counts: _counts, ...withoutCounts } = review;

    expect(supplierPriceListReviewSchema.safeParse(withoutCounts).success).toBe(false);
  });
});
