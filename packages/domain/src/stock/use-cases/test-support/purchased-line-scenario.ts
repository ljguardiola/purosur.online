import { receivePurchasedStock } from "../receive-purchased-stock.js";
import { FakeStockStore } from "./fake-stock-store.js";

export const BRANCH = "branch-1";
export const ACTOR = "person-2";
export const RECEIVED_AT = new Date("2026-03-10T15:00:00.000Z");
export const YERBA = { productId: "product-yerba", locationId: BRANCH };
export const FIDEOS = { productId: "product-fideos", locationId: BRANCH };

export function storeWithProducts(): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({ id: YERBA.productId, saleUnit: "UNIT" });
  store.seedProduct({ id: FIDEOS.productId, saleUnit: "UNIT" });
  store.seedBalance({ ...YERBA, quantity: 5_000 });
  store.seedBalance({ ...FIDEOS, quantity: 2_000 });
  return store;
}

async function receiveLine(store: FakeStockStore): Promise<void> {
  await store.transaction((tx) =>
    receivePurchasedStock(tx, {
      locationId: BRANCH,
      occurredAt: RECEIVED_AT,
      purchasedOn: "2026-03-09",
      actorId: "person-1",
      lines: [
        {
          purchaseLineId: "line-1",
          productId: YERBA.productId,
          quantity: 24_000,
          costPaidCents: 1_450_050,
          quantityPerPackage: 12_000,
          expiresOn: "2027-01-31",
        },
      ],
    }),
  );
}

export async function storeWithReceivedLine(): Promise<FakeStockStore> {
  const store = storeWithProducts();
  await receiveLine(store);
  return store;
}

export async function storeWithReceivedAndSplitLine(): Promise<FakeStockStore> {
  const store = await storeWithReceivedLine();
  store.seedLot({
    id: "lot-split",
    ...YERBA,
    purchaseLineId: "line-1",
    splitFromLotId: "lot-1",
    quantityReceived: 3_000,
    expiresOn: "2026-12-01",
    purchasedOn: "2026-03-09",
    costTotalCents: 1_450_050,
    costQuantity: 12_000,
    costComplete: true,
    receivedAt: new Date("2026-01-01T12:00:00.000Z"),
  });
  const movementId = store.seedMovement({
    ...YERBA,
    kind: "lot_split",
    reason: null,
    delta: 0,
    occurredAt: new Date("2026-03-11T10:00:00.000Z"),
    actorId: "person-1",
    supersededByCountId: null,
  });
  await store.transaction(async (tx) => {
    await tx.allocateToLot({ movementId, lotId: "lot-1", quantity: -3_000 });
    await tx.allocateToLot({ movementId, lotId: "lot-split", quantity: 3_000 });
  });
  return store;
}

export function seedPurchasedLotOfAnotherLine(
  store: FakeStockStore,
  id: string,
  purchasedOn = "2026-03-09",
): void {
  store.seedLot({
    id,
    ...YERBA,
    purchaseLineId: `line-of-${id}`,
    quantityReceived: 1_000,
    remaining: 1_000,
    purchasedOn,
  });
}

export async function leaveLotBy(
  store: FakeStockStore,
  kind: "sale" | "return" | "adjustment",
  quantity: number,
  lotId = "lot-1",
): Promise<void> {
  const movementId = store.seedMovement({
    ...YERBA,
    kind,
    reason: null,
    delta: quantity,
    occurredAt: new Date("2026-03-12T10:00:00.000Z"),
    actorId: "person-1",
    supersededByCountId: null,
  });
  await store.transaction((tx) => tx.allocateToLot({ movementId, lotId, quantity }));
}

export function countOf(
  store: FakeStockStore,
  key: { productId: string; locationId: string },
  occurredAt: Date,
): void {
  store.seedMovement({
    ...key,
    kind: "count",
    reason: null,
    delta: 0,
    occurredAt,
    actorId: "person-1",
    supersededByCountId: null,
  });
}
