import { arePurchasedLotsUntouched } from "../model/purchased-lot-move.js";
import type {
  PurchasedLot,
  PurchasedLotFacts,
  PurchasedLotMoveStoreTransaction,
  PurchasedLotStoreTransaction,
} from "./purchased-lot-store.js";
import type { ProductStockKey, StockStoreTransaction } from "./stock-store.js";

export type PurchasedLineLotsTransaction = Pick<
  PurchasedLotStoreTransaction,
  "lotsOfPurchaseLines" | "lockProductStock" | "recordMovement" | "allocateToLot"
> &
  Pick<StockStoreTransaction, "earliestCountAtOrAfter" | "addToBalance"> &
  PurchasedLotMoveStoreTransaction;

export interface LotsOfLine {
  own: PurchasedLot;
  lots: PurchasedLot[];
}

export async function lotsOfLine(
  tx: PurchasedLineLotsTransaction,
  locationId: string,
  purchaseLineId: string,
): Promise<LotsOfLine | undefined> {
  const lots = await tx.lotsOfPurchaseLines(locationId, [purchaseLineId]);
  const own = lots.find((lot) => lot.splitFromLotId === null);
  return own && { own, lots };
}

export async function factsOfUntouchedLots(
  tx: PurchasedLineLotsTransaction,
  purchaseLineId: string,
  lots: readonly PurchasedLot[],
): Promise<PurchasedLotFacts[] | undefined> {
  const lotIds = lots.map(({ lotId }) => lotId);
  const movements = await tx.movementsAllocatedToLots(lotIds);
  return arePurchasedLotsUntouched(purchaseLineId, movements)
    ? tx.purchasedLotFacts(lotIds)
    : undefined;
}

export interface LotsReceiptMovement {
  key: ProductStockKey;
  purchaseLineId: string;
  receivedAt: Date;
  actorId: string;
  facts: readonly PurchasedLotFacts[];
}

function totalRemaining(facts: readonly PurchasedLotFacts[]): number {
  return facts.reduce((sum, { remaining }) => sum + remaining, 0);
}

async function recordReceipt(
  tx: PurchasedLineLotsTransaction,
  { key, purchaseLineId, receivedAt, actorId }: LotsReceiptMovement,
  delta: number,
): Promise<string> {
  const movementId = await tx.recordMovement({
    ...key,
    purchaseLineId,
    kind: "receipt",
    reason: null,
    delta,
    occurredAt: receivedAt,
    actorId,
    supersededByCountId: null,
  });
  await tx.addToBalance(key, delta);
  return movementId;
}

export async function takeLotsOutOfStock(
  tx: PurchasedLineLotsTransaction,
  receipt: LotsReceiptMovement,
): Promise<void> {
  const movementId = await recordReceipt(tx, receipt, -totalRemaining(receipt.facts));
  for (const { lotId, remaining } of receipt.facts) {
    if (remaining !== 0) {
      await tx.allocateToLot({ movementId, lotId, quantity: -remaining });
    }
  }
  await tx.withdrawPurchasedLots(receipt.facts.map(({ lotId }) => lotId));
}

export async function putLotsInStock(
  tx: PurchasedLineLotsTransaction,
  receipt: LotsReceiptMovement,
): Promise<void> {
  const { key, purchaseLineId, facts } = receipt;
  const movementId = await recordReceipt(tx, receipt, totalRemaining(facts));
  const ownFirst = [
    ...facts.filter(({ splitFromLotId }) => splitFromLotId === null),
    ...facts.filter(({ splitFromLotId }) => splitFromLotId !== null),
  ];
  let ownLotId: string | null = null;
  for (const fact of ownFirst) {
    const lotId = await tx.recordMovedLot({
      ...key,
      purchaseLineId,
      splitFromLotId: fact.splitFromLotId === null ? null : ownLotId,
      quantityReceived: fact.quantityReceived,
      cost: fact.cost,
      costIncomplete: fact.costIncomplete,
      expiresOn: fact.expiresOn,
      purchasedOn: fact.purchasedOn,
      createdAt: fact.createdAt,
    });
    if (fact.splitFromLotId === null) {
      ownLotId = lotId;
    }
    if (fact.remaining !== 0) {
      await tx.allocateToLot({ movementId, lotId, quantity: fact.remaining });
    }
  }
}
