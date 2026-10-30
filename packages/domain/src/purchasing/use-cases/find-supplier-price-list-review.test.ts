import { describe, expect, it } from "vitest";
import { findSupplierPriceListReview } from "./find-supplier-price-list-review.js";
import { FakeSupplierPriceListReader } from "./test-support/fake-supplier-price-list-reader.js";

const LIST = {
  id: "list-1",
  supplier: { id: "supplier-a", name: "Distribuidora Sur" },
  source: { kind: "PDF" as const, fileName: "lista.pdf" },
  listDate: "2026-03-01",
  rowCount: 2,
  unpricedRowCount: 1,
  state: "EXTRACTED" as const,
  readFailure: null,
  rereading: false,
  lastRereadFailure: null,
  uploadedAt: new Date("2026-03-01T12:00:00Z"),
  confirmedAt: null,
  version: 4,
  pricesIncludeVat: false,
};

const LINKED = {
  product: {
    id: "product-1",
    name: "Yerba",
    brandName: "Piragüé",
    netContent: { quantity: 1, unit: "KG" as const },
    saleUnit: "UNIT" as const,
  },
  packaging: {
    id: "packaging-1",
    name: "Caja x 10",
    quantityPerPackage: 10_000,
    active: true,
    saleUnit: "UNIT" as const,
  },
  vatRate: 1050,
};

describe("findSupplierPriceListReview", () => {
  it("answers not_found for a missing list", async () => {
    expect(await findSupplierPriceListReview(new FakeSupplierPriceListReader(), "list-1")).toEqual({
      kind: "not_found",
    });
  });

  it("answers the list and its rows, each with the page it was read from", async () => {
    const reader = new FakeSupplierPriceListReader({
      lists: [LIST],
      rows: [
        {
          listId: "list-1",
          id: "row-1",
          description: "Yerba 1 kg",
          code: "Y-1",
          presentation: "Caja x 10",
          priceCents: 150_050,
          page: 3,
        },
        {
          listId: "list-1",
          id: "row-2",
          description: "Azucar 1 kg",
          code: null,
          presentation: null,
          priceCents: null,
          page: null,
        },
        {
          listId: "other",
          id: "row-3",
          description: "Ajeno",
          code: null,
          presentation: null,
          priceCents: 1,
          page: 1,
        },
      ],
    });

    const outcome = await findSupplierPriceListReview(reader, "list-1");

    const { confirmedAt: _confirmedAt, ...listed } = LIST;
    expect(outcome).toEqual({
      kind: "found",
      list: { ...listed, replaced: false, requiresVatRate: true },
      actions: {
        changeRows: true,
        confirm: true,
        discard: true,
        linkRows: true,
        markRowsReviewed: true,
      },
      counts: { needingReview: 2, linkedAutomatically: 0 },
      rows: [
        {
          id: "row-1",
          description: "Yerba 1 kg",
          code: "Y-1",
          presentation: "Caja x 10",
          priceCents: 150_050,
          page: 3,
          barcode: null,
          link: null,
          mayCreateProduct: true,
          status: "new",
          needsReview: true,
          previousPriceCents: null,
          pricePerSaleUnit: null,
        },
        {
          id: "row-2",
          description: "Azucar 1 kg",
          code: null,
          presentation: null,
          priceCents: null,
          page: null,
          barcode: null,
          link: null,
          mayCreateProduct: true,
          status: "new",
          needsReview: true,
          previousPriceCents: null,
          pricePerSaleUnit: null,
        },
      ],
    });
  });

  it("answers whether the list is being read again and why its latest reread failed", async () => {
    const reader = new FakeSupplierPriceListReader({
      lists: [{ ...LIST, rereading: true, lastRereadFailure: "interrupted" }],
    });

    expect(await findSupplierPriceListReview(reader, "list-1")).toMatchObject({
      kind: "found",
      list: { rereading: true, lastRereadFailure: "interrupted" },
    });
  });

  it("answers that a confirmed list was replaced by a newer confirmed list of its supplier", async () => {
    const reader = new FakeSupplierPriceListReader({
      lists: [
        {
          ...LIST,
          state: "REVIEWED",
          listDate: "2026-03-01",
          confirmedAt: new Date("2026-03-02T10:00:00Z"),
        },
        {
          ...LIST,
          id: "list-2",
          state: "REVIEWED",
          listDate: "2026-04-01",
          confirmedAt: new Date("2026-04-02T10:00:00Z"),
          uploadedAt: new Date("2026-04-01T12:00:00Z"),
        },
      ],
    });

    const replaced = await findSupplierPriceListReview(reader, "list-1");
    const current = await findSupplierPriceListReview(reader, "list-2");

    expect(replaced.kind === "found" && replaced.list.replaced).toBe(true);
    expect(current.kind === "found" && current.list.replaced).toBe(false);
  });

  it.each([
    [
      "READING",
      {
        changeRows: false,
        confirm: false,
        discard: false,
        linkRows: false,
        markRowsReviewed: false,
      },
    ],
    [
      "READ_FAILED",
      {
        changeRows: false,
        confirm: false,
        discard: true,
        linkRows: false,
        markRowsReviewed: false,
      },
    ],
    [
      "EXTRACTED",
      { changeRows: true, confirm: true, discard: true, linkRows: true, markRowsReviewed: true },
    ],
    [
      "REVIEWED",
      {
        changeRows: false,
        confirm: false,
        discard: false,
        linkRows: true,
        markRowsReviewed: false,
      },
    ],
    [
      "DISCARDED",
      {
        changeRows: false,
        confirm: false,
        discard: false,
        linkRows: false,
        markRowsReviewed: false,
      },
    ],
  ] as const)("answers which actions a list in state %s allows", async (state, actions) => {
    const reader = new FakeSupplierPriceListReader({ lists: [{ ...LIST, state }] });

    const outcome = await findSupplierPriceListReview(reader, "list-1");

    expect(outcome.kind === "found" && outcome.actions).toEqual(actions);
  });

  it.each(["EXTRACTED", "REVIEWED"] as const)(
    "answers that only a row without a link may create a product in a list in state %s",
    async (state) => {
      const reader = new FakeSupplierPriceListReader({
        lists: [{ ...LIST, state }],
        rows: [
          {
            listId: "list-1",
            id: "bare",
            description: "A",
            code: null,
            presentation: null,
            priceCents: 1,
            page: null,
          },
          {
            listId: "list-1",
            id: "linked",
            description: "B",
            code: null,
            presentation: null,
            priceCents: 1,
            page: null,
            link: LINKED,
          },
        ],
      });

      const outcome = await findSupplierPriceListReview(reader, "list-1");

      expect(outcome.kind === "found" && outcome.rows.map((row) => row.mayCreateProduct)).toEqual([
        true,
        false,
      ]);
    },
  );

  it.each(["READING", "READ_FAILED", "DISCARDED"] as const)(
    "answers that no row may create a product in a list in state %s",
    async (state) => {
      const reader = new FakeSupplierPriceListReader({
        lists: [{ ...LIST, state }],
        rows: [
          {
            listId: "list-1",
            id: "bare",
            description: "A",
            code: null,
            presentation: null,
            priceCents: 1,
            page: null,
          },
        ],
      });

      const outcome = await findSupplierPriceListReview(reader, "list-1");

      expect(outcome.kind === "found" && outcome.rows[0]?.mayCreateProduct).toBe(false);
    },
  );

  it.each([
    [false, true],
    [null, true],
    [true, false],
  ] as const)(
    "answers whether the links of a list whose prices include VAT (%j) need a rate: %s",
    async (pricesIncludeVat, requiresVatRate) => {
      const reader = new FakeSupplierPriceListReader({ lists: [{ ...LIST, pricesIncludeVat }] });

      const outcome = await findSupplierPriceListReview(reader, "list-1");

      expect(outcome.kind === "found" && outcome.list.requiresVatRate).toBe(requiresVatRate);
    },
  );

  describe("the status and price of each linked row", () => {
    const LINK = {
      product: {
        id: "product-1",
        name: "Yerba",
        brandName: "Piragüé",
        netContent: { quantity: 1, unit: "KG" as const },
        saleUnit: "UNIT" as const,
      },
      packaging: {
        id: "packaging-1",
        name: "Caja x 10",
        quantityPerPackage: 10_000,
        active: true,
        saleUnit: "UNIT" as "UNIT" | "KG",
      },
      vatRate: 1050 as number | null,
    };

    function reviewOf(
      row: {
        description?: string;
        priceCents?: number | null;
        link?: typeof LINK | null;
        reviewed?: boolean;
        remembered?: boolean;
        earlier?: { description: string; priceCents: number } | null;
      },
      list: { pricesIncludeVat: boolean | null; state?: "EXTRACTED" | "REVIEWED" } = {
        pricesIncludeVat: false,
      },
    ) {
      const reader = new FakeSupplierPriceListReader({
        lists: [{ ...LIST, ...list }],
        rows: [
          {
            listId: "list-1",
            id: "row-1",
            description: "Yerba 1 kg",
            code: "Y-1",
            presentation: null,
            priceCents: 10_000,
            page: null,
            link: LINK,
            remembered: true,
            earlier: { description: "Yerba 1 kg", priceCents: 10_000 },
            ...row,
          },
        ],
      });
      return findSupplierPriceListReview(reader, "list-1").then((outcome) =>
        outcome.kind === "found" ? outcome : undefined,
      );
    }

    it("passes on the barcode and the link of the row", async () => {
      const reader = new FakeSupplierPriceListReader({
        lists: [LIST],
        rows: [
          {
            listId: "list-1",
            id: "row-1",
            description: "Yerba",
            code: null,
            presentation: null,
            priceCents: 1,
            page: null,
            barcode: "7790001000012",
            link: LINK,
          },
        ],
      });

      const outcome = await findSupplierPriceListReview(reader, "list-1");

      expect(outcome.kind === "found" && outcome.rows[0]).toMatchObject({
        barcode: "7790001000012",
        link: {
          product: LINK.product,
          packaging: { id: "packaging-1", name: "Caja x 10", quantityPerPackage: 10_000 },
          vatRate: 1050,
        },
      });
    });

    it("answers whether the packaging of the link may still be bought by", async () => {
      const buyable = await reviewOf({});
      const inactive = await reviewOf({
        link: { ...LINK, packaging: { ...LINK.packaging, active: false } },
      });
      const otherSaleUnit = await reviewOf({
        link: { ...LINK, packaging: { ...LINK.packaging, saleUnit: "KG" } },
      });

      expect(buyable?.rows[0]?.link?.packaging.buyable).toBe(true);
      expect(inactive?.rows[0]?.link?.packaging.buyable).toBe(false);
      expect(otherSaleUnit?.rows[0]?.link?.packaging.buyable).toBe(false);
    });

    it("answers no price per sale unit through a packaging that may no longer be bought by", async () => {
      const inactive = await reviewOf({
        link: { ...LINK, packaging: { ...LINK.packaging, active: false } },
      });
      const otherSaleUnit = await reviewOf({
        link: { ...LINK, packaging: { ...LINK.packaging, saleUnit: "KG" } },
      });

      expect(inactive?.rows[0]?.pricePerSaleUnit).toBeNull();
      expect(otherSaleUnit?.rows[0]?.pricePerSaleUnit).toBeNull();
    });

    it("derives the status from the row and what the supplier's other lists recorded", async () => {
      expect((await reviewOf({}))?.rows[0]?.status).toBe("linked");
      expect(
        (await reviewOf({ remembered: false, earlier: null, link: null }))?.rows[0]?.status,
      ).toBe("new");
      expect((await reviewOf({ earlier: null }))?.rows[0]?.status).toBe("linked");
      expect((await reviewOf({ reviewed: true, link: null }))?.rows[0]?.status).toBe("reviewed");
      expect((await reviewOf({ link: null }))?.rows[0]?.status).toBe("unlinked");
      expect((await reviewOf({ description: "Yerba 1 kg x" }))?.rows[0]?.status).toBe(
        "description_changed",
      );
    });

    it("asks for the rate of a link without one only when the list's prices exclude VAT", async () => {
      const withoutRate = { link: { ...LINK, vatRate: null } };

      expect((await reviewOf(withoutRate, { pricesIncludeVat: false }))?.rows[0]?.status).toBe(
        "vat_rate_missing",
      );
      expect((await reviewOf(withoutRate, { pricesIncludeVat: null }))?.rows[0]?.status).toBe(
        "vat_rate_missing",
      );
      expect((await reviewOf(withoutRate, { pricesIncludeVat: true }))?.rows[0]?.status).toBe(
        "linked",
      );
    });

    it("answers that a row needs review for every status but linked and reviewed", async () => {
      const needing = async (
        row: Parameters<typeof reviewOf>[0],
        list?: Parameters<typeof reviewOf>[1],
      ) => (await reviewOf(row, list))?.rows[0]?.needsReview;

      expect(await needing({})).toBe(false);
      expect(await needing({ reviewed: true, link: null })).toBe(false);
      expect(await needing({ remembered: false, earlier: null, link: null })).toBe(true);
      expect(await needing({ earlier: null })).toBe(false);
      expect(await needing({ link: null })).toBe(true);
      expect(await needing({ priceCents: 12_000 })).toBe(true);
      expect(await needing({ description: "Yerba 1 kg x" })).toBe(true);
      expect(await needing({ link: { ...LINK, vatRate: null } }, { pricesIncludeVat: false })).toBe(
        true,
      );
    });

    it("answers the earlier price only of a row whose price changed", async () => {
      const changed = await reviewOf({
        priceCents: 12_000,
        earlier: { description: "Yerba 1 kg", priceCents: 9_000 },
      });
      const same = await reviewOf({});
      const changedButReviewed = await reviewOf({
        priceCents: 12_000,
        reviewed: true,
        earlier: { description: "Yerba 1 kg", priceCents: 9_000 },
      });

      expect(changed?.rows[0]).toMatchObject({
        status: "price_changed",
        previousPriceCents: 9_000,
      });
      expect(same?.rows[0]?.previousPriceCents).toBeNull();
      expect(changedButReviewed?.rows[0]?.previousPriceCents).toBeNull();
    });

    it("answers the exact price per sale unit with VAT of a linked row with a price", async () => {
      const excluding = await reviewOf({ priceCents: 10_000 }, { pricesIncludeVat: false });
      const including = await reviewOf(
        { priceCents: 10_000, link: { ...LINK, vatRate: null } },
        { pricesIncludeVat: true },
      );

      expect(excluding?.rows[0]?.pricePerSaleUnit).toEqual({ numerator: 1_105n, denominator: 1n });
      expect(including?.rows[0]?.pricePerSaleUnit).toEqual({ numerator: 1_000n, denominator: 1n });
    });

    it("answers no price per sale unit without a link, a price or a rate the list needs", async () => {
      expect((await reviewOf({ link: null }))?.rows[0]?.pricePerSaleUnit).toBeNull();
      expect((await reviewOf({ priceCents: null }))?.rows[0]?.pricePerSaleUnit).toBeNull();
      expect(
        (await reviewOf({ link: { ...LINK, vatRate: null } }, { pricesIncludeVat: false }))?.rows[0]
          ?.pricePerSaleUnit,
      ).toBeNull();
    });

    it("counts the rows that need review and the ones linked automatically", async () => {
      const reader = new FakeSupplierPriceListReader({
        lists: [{ ...LIST, pricesIncludeVat: true }],
        rows: [
          { id: "a", link: LINK, remembered: true, earlier: { description: "A", priceCents: 1 } },
          { id: "b", link: LINK, remembered: true, earlier: { description: "B", priceCents: 1 } },
          { id: "c", link: null, earlier: null },
          { id: "d", link: null, earlier: null, reviewed: true },
          { id: "e", link: LINK, remembered: true, earlier: { description: "E", priceCents: 2 } },
        ].map((row) => ({
          listId: "list-1",
          description: row.id.toUpperCase(),
          code: null,
          presentation: null,
          priceCents: 1,
          page: null,
          ...row,
        })),
      });

      const outcome = await findSupplierPriceListReview(reader, "list-1");

      expect(outcome.kind === "found" && outcome.counts).toEqual({
        needingReview: 2,
        linkedAutomatically: 2,
      });
    });
  });
});
