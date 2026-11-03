import { FakePurchasingStore } from "./fake-purchasing-store.js";

export const BRANCH = "branch-1";
export const ACTOR = "person-1";
export const PURCHASE_ID = "purchase-a";
export const NOW = new Date("2026-03-10T15:00:00Z");
export const CLOCK = { now: () => NOW };

export function storeWithRegisteredPurchase(): FakePurchasingStore {
  const store = new FakePurchasingStore();
  store.seedProduct({ id: "product-a", name: "Yerba", saleUnit: "UNIT", active: true });
  store.seedProduct({ id: "product-b", name: "Harina", saleUnit: "KG", active: true });
  store.seedPurchase({
    id: PURCHASE_ID,
    supplierId: "supplier-a",
    locationId: BRANCH,
    purchasedOn: "2026-03-05",
    receiptType: "factura_b",
    receiptNumber: "0001-00001234",
    note: "Entrega de la tarde",
    recordedAt: new Date("2026-03-05T12:00:00Z"),
    actorId: "person-0",
  });
  store.seedPurchaseLine({
    id: "line-1",
    purchaseId: PURCHASE_ID,
    position: 1,
    productId: "product-a",
    packages: 2,
    quantity: 24_000,
    costPaidCents: 1_450_050,
    quantityPerPackage: 12_000,
    expiresOn: "2026-11-10",
  });
  store.seedPurchaseLine({
    id: "line-2",
    purchaseId: PURCHASE_ID,
    position: 2,
    productId: "product-b",
    packages: null,
    quantity: 2_500,
    costPaidCents: 90_000,
    quantityPerPackage: 1_000,
    expiresOn: null,
  });
  return store;
}
