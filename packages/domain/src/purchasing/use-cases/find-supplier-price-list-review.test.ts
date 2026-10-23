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
  uploadedAt: new Date("2026-03-01T12:00:00Z"),
  confirmedAt: null,
  version: 4,
  pricesIncludeVat: false,
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
      list: { ...listed, replaced: false },
      actions: { changeRows: true, confirm: true, discard: true, linkRows: true },
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
          status: "new",
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
          status: "new",
          previousPriceCents: null,
          pricePerSaleUnit: null,
        },
      ],
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
    ["READING", { changeRows: false, confirm: false, discard: false, linkRows: false }],
    ["READ_FAILED", { changeRows: false, confirm: false, discard: true, linkRows: false }],
    ["EXTRACTED", { changeRows: true, confirm: true, discard: true, linkRows: true }],
    ["REVIEWED", { changeRows: false, confirm: false, discard: false, linkRows: true }],
    ["DISCARDED", { changeRows: false, confirm: false, discard: false, linkRows: false }],
  ] as const)("answers which actions a list in state %s allows", async (state, actions) => {
    const reader = new FakeSupplierPriceListReader({ lists: [{ ...LIST, state }] });

    const outcome = await findSupplierPriceListReview(reader, "list-1");

    expect(outcome.kind === "found" && outcome.actions).toEqual(actions);
  });

  describe("the status and price of each linked row", () => {
    const LINK = {
      product: { id: "product-1", name: "Yerba Taragüi", saleUnit: "UNIT" as const },
      packaging: { id: "packaging-1", name: "Caja x 10", quantityPerPackage: 10_000 },
      vatRate: 1050 as number | null,
    };

    function reviewOf(
      row: {
        description?: string;
        priceCents?: number | null;
        link?: typeof LINK | null;
        reviewed?: boolean;
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
        link: LINK,
      });
    });

    it("derives the status from the row and what the supplier's other lists recorded", async () => {
      expect((await reviewOf({}))?.rows[0]?.status).toBe("linked");
      expect((await reviewOf({ earlier: null, link: null }))?.rows[0]?.status).toBe("new");
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
          { id: "a", link: LINK, earlier: { description: "A", priceCents: 1 } },
          { id: "b", link: LINK, earlier: { description: "B", priceCents: 1 } },
          { id: "c", link: null, earlier: null },
          { id: "d", link: null, earlier: null, reviewed: true },
          { id: "e", link: LINK, earlier: { description: "E", priceCents: 2 } },
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
