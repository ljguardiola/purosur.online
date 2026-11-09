import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { LotNameFacts } from "../../stock/index.js";
import { findPurchaseListing, listPurchases } from "./list-purchases.js";
import type { LinkedFreightListing, PurchaseListing } from "./purchasing-list-reader.js";
import { FakePurchasingListReader } from "./test-support/fake-purchasing-list-reader.js";

const BRANCH = "branch-1";
const BUYER = { isAdministrator: false, permissionKeys: ["record_purchases"] };
const FREIGHT_MANAGER = { isAdministrator: false, permissionKeys: ["manage_freight"] };
const ADMINISTRATOR = { isAdministrator: true, permissionKeys: [] };
const VIEWER = { ...BUYER, locationId: BRANCH };

function lotOf(lotId: string, nameOrder: number, purchasedOn = "2026-10-01"): LotNameFacts {
  return {
    lotId,
    productId: "p-unit",
    locationId: BRANCH,
    nameOrder,
    givenNumber: null,
    origin: { kind: "purchase", purchasedOn },
  };
}

function ports(reader: FakePurchasingListReader) {
  return { reader, zoneRules: new FakeZoneRulesSource() };
}

const LINE = {
  id: "line-1",
  product: {
    id: "p-unit",
    name: "Yerba",
    brandName: "Piragüé",
    netContent: { quantity: 500, unit: "G" as const },
    saleUnit: "UNIT" as const,
  },
  packages: 2,
  quantity: 24_000,
  costPaidCents: 24_000,
  quantityPerPackage: 12_000,
  lotId: "lot-1",
  remainingInLot: 18_000,
  expiresOn: "2027-03-01",
};

const PURCHASE: PurchaseListing = {
  id: "purchase-1",
  locationId: BRANCH,
  purchasedOn: "2026-10-01",
  supplier: { id: "s-1", name: "Distribuidora Sur" },
  receiptType: "factura_b",
  receiptNumber: "0001-00000042",
  note: null,
  recordedAt: new Date("2026-10-02T12:00:00.000Z"),
  lines: [LINE],
};

const FREIGHTS: LinkedFreightListing[] = [
  {
    purchaseId: "purchase-1",
    id: "freight-1",
    date: "2026-10-03",
    description: "Flete de la semana",
    amountCents: 15_000,
    means: { kind: "carrier", name: "Transportes del Sur" },
  },
  {
    purchaseId: "purchase-1",
    id: "freight-2",
    date: "2026-10-01",
    description: "Viaje propio",
    amountCents: 8_000,
    means: { kind: "own_trip" },
  },
];

const OTHER_PURCHASE_FREIGHT: LinkedFreightListing = {
  purchaseId: "purchase-2",
  id: "freight-3",
  date: "2026-10-02",
  description: "Flete de otra compra",
  amountCents: 5_000,
  means: { kind: "own_trip" },
};

function withoutPurchaseId({ purchaseId: _purchaseId, ...freight }: LinkedFreightListing) {
  return freight;
}

describe("listPurchases", () => {
  it("lists only the purchases of the supplier asked for", async () => {
    const reader = new FakePurchasingListReader({
      purchases: [
        PURCHASE,
        { ...PURCHASE, id: "purchase-2", supplier: { id: "s-2", name: "Norte" } },
      ],
      lots: [lotOf("lot-1", 1)],
    });

    const purchases = await listPurchases(ports(reader), VIEWER, "s-2");

    expect(purchases.map(({ id }) => id)).toEqual(["purchase-2"]);
  });

  it("answers each line with its unit cost rounded half up to cents per sale unit", async () => {
    const thirds = {
      ...LINE,
      id: "line-2",
      lotId: "lot-2",
      costPaidCents: 1_000,
      quantityPerPackage: 3_000,
    };
    const reader = new FakePurchasingListReader({
      purchases: [{ ...PURCHASE, lines: [LINE, thirds] }],
      lots: [lotOf("lot-1", 1), lotOf("lot-2", 2)],
    });

    const [purchase] = await listPurchases(ports(reader), VIEWER);

    expect(purchase?.lines.map((line) => line.unitCostCents)).toEqual([2_000, 333]);
    expect(purchase?.lines[1]).toMatchObject({ costPaidCents: 1_000, quantityPerPackage: 3_000 });
  });

  it("answers each line with what remains in the lot it created", async () => {
    const reader = new FakePurchasingListReader({
      purchases: [PURCHASE],
      lots: [lotOf("lot-1", 1)],
    });

    const [purchase] = await listPurchases(ports(reader), VIEWER);

    expect(purchase?.lines[0]?.remainingInLot).toBe(18_000);
  });

  it("answers each line with the system name of the lot it created", async () => {
    const reader = new FakePurchasingListReader({
      purchases: [PURCHASE],
      lots: [lotOf("lot-1", 1, "2026-11-03")],
    });

    const [purchase] = await listPurchases(ports(reader), VIEWER);

    expect(purchase?.lines[0]?.lotName).toEqual({
      origin: "purchase",
      day: "2026-11-03",
      number: null,
    });
  });

  it("numbers the lot after the other lots of its product and branch, those of other purchases included", async () => {
    const second = { ...LINE, id: "line-2", lotId: "lot-2" };
    const reader = new FakePurchasingListReader({
      purchases: [
        { ...PURCHASE, id: "purchase-2", lines: [second] },
        { ...PURCHASE, lines: [LINE] },
      ],
      lots: [lotOf("lot-1", 1), lotOf("lot-2", 2)],
    });

    const purchases = await listPurchases(ports(reader), VIEWER);

    expect(purchases.map((purchase) => purchase.lines[0]?.lotName.number)).toEqual([2, 1]);
  });

  it("asks for the lots of the products the purchases bought, once", async () => {
    const other = {
      ...LINE,
      id: "line-2",
      lotId: "lot-2",
      product: { ...LINE.product, id: "p-2" },
    };
    const reader = new FakePurchasingListReader({
      purchases: [{ ...PURCHASE, lines: [LINE, other, { ...LINE, id: "line-3", lotId: "lot-3" }] }],
      lots: [lotOf("lot-1", 1), lotOf("lot-2", 2), lotOf("lot-3", 3)],
    });

    await listPurchases(ports(reader), VIEWER);

    expect(reader.lotNameReads).toEqual([{ locationId: BRANCH, productIds: ["p-unit", "p-2"] }]);
  });

  it("refuses a line whose lot the reader gave no name facts for, naming the lot", async () => {
    const reader = new FakePurchasingListReader({ purchases: [PURCHASE], lots: [] });

    await expect(listPurchases(ports(reader), VIEWER)).rejects.toThrow(
      "no name facts for lot lot-1",
    );
  });

  it("answers only the purchases of the branch asked for", async () => {
    const elsewhere = { ...PURCHASE, id: "purchase-2", locationId: "branch-2" };
    const reader = new FakePurchasingListReader({
      purchases: [elsewhere, PURCHASE],
      lots: [lotOf("lot-1", 1)],
    });

    const purchases = await listPurchases(ports(reader), VIEWER);

    expect(purchases.map((purchase) => purchase.id)).toEqual(["purchase-1"]);
  });

  it.each([
    ["who manages freights", FREIGHT_MANAGER],
    ["an administrator", ADMINISTRATOR],
  ])("answers each purchase with the freights linked to it to %s", async (_who, access) => {
    const reader = new FakePurchasingListReader({
      purchases: [PURCHASE, { ...PURCHASE, id: "purchase-2" }, { ...PURCHASE, id: "purchase-3" }],
      lots: [lotOf("lot-1", 1)],
      freights: [...FREIGHTS, OTHER_PURCHASE_FREIGHT],
    });

    const purchases = await listPurchases(ports(reader), { ...access, locationId: BRANCH });

    expect(purchases.map((purchase) => purchase.freights)).toEqual([
      FREIGHTS.map(withoutPurchaseId),
      [withoutPurchaseId(OTHER_PURCHASE_FREIGHT)],
      [],
    ]);
    expect(reader.linkedFreightReads).toEqual([["purchase-1", "purchase-2", "purchase-3"]]);
  });

  it("answers no linked freights to who does not manage freights, without reading them", async () => {
    const reader = new FakePurchasingListReader({
      purchases: [PURCHASE],
      lots: [lotOf("lot-1", 1)],
      freights: FREIGHTS,
    });

    const [purchase] = await listPurchases(ports(reader), VIEWER);

    expect(purchase?.freights).toBeNull();
    expect(reader.linkedFreightReads).toEqual([]);
  });

  it("answers nothing when the branch has no purchases", async () => {
    expect(await listPurchases(ports(new FakePurchasingListReader()), VIEWER)).toEqual([]);
  });
});

describe("findPurchaseListing", () => {
  it("answers the purchase with its lines' unit cost", async () => {
    const other = { ...PURCHASE, id: "purchase-2" };
    const reader = new FakePurchasingListReader({
      purchases: [other, PURCHASE],
      lots: [lotOf("lot-1", 1)],
    });

    const purchase = await findPurchaseListing(ports(reader), "purchase-1", BUYER);

    expect(purchase?.id).toBe("purchase-1");
    expect(purchase?.lines[0]?.unitCostCents).toBe(2_000);
  });

  it("answers the purchase with the freights linked to it to who manages freights", async () => {
    const reader = new FakePurchasingListReader({
      purchases: [PURCHASE, { ...PURCHASE, id: "purchase-2" }],
      lots: [lotOf("lot-1", 1)],
      freights: [...FREIGHTS, OTHER_PURCHASE_FREIGHT],
    });

    const purchase = await findPurchaseListing(ports(reader), "purchase-1", FREIGHT_MANAGER);

    expect(purchase?.freights).toEqual(FREIGHTS.map(withoutPurchaseId));
    expect(reader.linkedFreightReads).toEqual([["purchase-1"]]);
  });

  it("answers the purchase with no linked freights to who does not manage freights, without reading them", async () => {
    const reader = new FakePurchasingListReader({
      purchases: [PURCHASE],
      lots: [lotOf("lot-1", 1)],
      freights: FREIGHTS,
    });

    const purchase = await findPurchaseListing(ports(reader), "purchase-1", BUYER);

    expect(purchase?.freights).toBeNull();
    expect(reader.linkedFreightReads).toEqual([]);
  });

  it("answers nothing for a purchase that does not exist", async () => {
    expect(
      await findPurchaseListing(ports(new FakePurchasingListReader()), "missing", FREIGHT_MANAGER),
    ).toBeUndefined();
  });
});
