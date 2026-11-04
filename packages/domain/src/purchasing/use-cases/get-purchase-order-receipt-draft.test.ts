import { describe, expect, it } from "vitest";
import { getPurchaseOrderReceiptDraft } from "./get-purchase-order-receipt-draft.js";
import {
  FakePurchaseOrderReader,
  type FakeReceivableOrder,
} from "./test-support/fake-purchase-order-reader.js";

const BRANCH = "branch-1";

const yerba = {
  id: "product-a",
  name: "Yerba",
  saleUnit: "UNIT" as const,
  brandName: "Piragüé",
  netContent: { quantity: 500, unit: "G" as const },
};

const dozenAt250 = {
  link: { quantity: 12_000, saleUnit: "UNIT" as const, relinkRequired: false },
  priceCents: 3_000,
  pricesIncludeVat: true,
  vatRate: null,
};

function line(overrides: Partial<FakeReceivableOrder["lines"][number]> = {}) {
  return {
    product: yerba,
    packages: 3,
    quantityPerPackage: 12_000,
    receivedQuantity: 0,
    supplierOffer: dozenAt250,
    ...overrides,
  };
}

function order(overrides: Partial<FakeReceivableOrder> = {}): FakeReceivableOrder {
  return {
    id: "order-1",
    locationId: BRANCH,
    supplier: { id: "supplier-a", name: "Distribuidora Sur" },
    state: "SENT",
    lines: [line()],
    ...overrides,
  };
}

async function draftOf(receivable: FakeReceivableOrder) {
  const outcome = await getPurchaseOrderReceiptDraft(
    new FakePurchaseOrderReader([], [receivable]),
    { locationId: BRANCH, orderId: "order-1" },
  );
  if (outcome.kind !== "found") {
    throw new Error(`expected a draft, got ${outcome.kind}`);
  }
  return outcome.draft;
}

describe("getPurchaseOrderReceiptDraft", () => {
  it("prefills each line with the packages ordered at the supplier's list cost per package", async () => {
    expect(await draftOf(order())).toEqual({
      supplier: { id: "supplier-a", name: "Distribuidora Sur" },
      lines: [
        {
          product: yerba,
          loadedBy: "packages",
          packages: 3,
          quantityPerPackage: 12_000,
          listCostPerPackageCents: 3_000,
        },
      ],
    });
  });

  it("prefills what earlier receipts left outstanding, by whole packages", async () => {
    const draft = await draftOf(
      order({ state: "PARTIALLY_RECEIVED", lines: [line({ receivedQuantity: 12_000 })] }),
    );

    expect(draft.lines).toMatchObject([{ loadedBy: "packages", packages: 2 }]);
  });

  it("prefills by quantity when the outstanding quantity is not a whole number of packages", async () => {
    const draft = await draftOf(
      order({ state: "PARTIALLY_RECEIVED", lines: [line({ receivedQuantity: 10_000 })] }),
    );

    expect(draft.lines).toEqual([
      { product: yerba, loadedBy: "quantity", quantity: 26_000, listCostPerSaleUnitCents: 250 },
    ]);
  });

  it("leaves out the lines earlier receipts filled", async () => {
    const other = { ...yerba, id: "product-b", name: "Azúcar" };
    const draft = await draftOf(
      order({
        state: "PARTIALLY_RECEIVED",
        lines: [line({ receivedQuantity: 36_000 }), line({ product: other })],
      }),
    );

    expect(draft.lines.map(({ product }) => product.id)).toEqual(["product-b"]);
  });

  it("leaves the list cost out for a line the supplier has no offer for", async () => {
    const draft = await draftOf(order({ lines: [line({ supplierOffer: null })] }));

    expect(draft.lines).toMatchObject([{ listCostPerPackageCents: null }]);
  });

  it("leaves the list cost out for an offer whose link no longer fits the product", async () => {
    const outdated = { ...dozenAt250, link: { ...dozenAt250.link, relinkRequired: true } };

    const draft = await draftOf(order({ lines: [line({ supplierOffer: outdated })] }));

    expect(draft.lines).toMatchObject([{ listCostPerPackageCents: null }]);
  });

  it("rounds a list cost that is not a whole number of cents half up", async () => {
    const perKilo = {
      link: { quantity: 3_000, saleUnit: "KG" as const, relinkRequired: false },
      priceCents: 1_000,
      pricesIncludeVat: true,
      vatRate: null,
    };
    const flour = { ...yerba, saleUnit: "KG" as const };

    const draft = await draftOf(
      order({
        lines: [line({ product: flour, quantityPerPackage: 500, supplierOffer: perKilo })],
      }),
    );

    expect(draft.lines).toMatchObject([{ listCostPerPackageCents: 167 }]);
  });

  it.each(["DRAFT", "RECEIVED", "CANCELLED"] as const)(
    "refuses an order %s as not receivable",
    async (state) => {
      const reader = new FakePurchaseOrderReader([], [order({ state })]);

      expect(
        await getPurchaseOrderReceiptDraft(reader, { locationId: BRANCH, orderId: "order-1" }),
      ).toEqual({ kind: "not_receivable" });
    },
  );

  it("does not find an order of another branch or one that does not exist", async () => {
    const reader = new FakePurchaseOrderReader([], [order()]);

    expect(
      await getPurchaseOrderReceiptDraft(reader, { locationId: "branch-2", orderId: "order-1" }),
    ).toEqual({ kind: "not_found" });
    expect(
      await getPurchaseOrderReceiptDraft(reader, { locationId: BRANCH, orderId: "nope" }),
    ).toEqual({ kind: "not_found" });
  });
});
