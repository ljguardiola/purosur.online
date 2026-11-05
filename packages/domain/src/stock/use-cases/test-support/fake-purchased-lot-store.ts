import type { LotNameFacts, PurchasedLotNaming } from "../../model/lot-name.js";
import type { LotCost } from "../../model/lot-value.js";
import type {
  NewSplitLot,
  PurchasedLot,
  PurchasedLotStoreTransaction,
  SplittableLot,
} from "../purchased-lot-store.js";
import type {
  LockProductStockResult,
  LotAllocation,
  NewStockMovement,
  ProductStockKey,
} from "../stock-store.js";

export interface FakePurchasedLot extends Omit<PurchasedLot, "splitFromLotId"> {
  splitFromLotId?: string | undefined;
  createdAt?: Date | undefined;
  costIncomplete?: boolean | undefined;
  quantityReceived?: number | undefined;
  locationId: string;
  expiresOn: string | null;
  purchasedOn: string;
  nameOrder: number;
  givenNumber: number | null;
  remaining: number;
}

export interface FakeLotCostChange {
  lotId: string;
  changedAt: Date;
  previous: LotCost;
}

export class FakePurchasedLotTransaction implements PurchasedLotStoreTransaction {
  lots: FakePurchasedLot[];
  costs: Map<string, LotCost>;
  costChanges: FakeLotCostChange[] = [];
  missingProducts = new Set<string>();
  operations: string[] = [];
  movements: NewStockMovement[] = [];
  allocations: LotAllocation[] = [];

  constructor(lots: FakePurchasedLot[], costs: ReadonlyMap<string, LotCost> = new Map()) {
    this.lots = lots;
    this.costs = new Map(costs);
  }

  async lockProductStock(key: ProductStockKey): Promise<LockProductStockResult> {
    this.operations.push(`lockProductStock:${key.productId}`);
    return this.missingProducts.has(key.productId)
      ? { kind: "not_found" }
      : { kind: "locked", saleUnit: "UNIT", balance: 0 };
  }

  async lotsOfPurchaseLines(
    locationId: string,
    purchaseLineIds: readonly string[],
  ): Promise<PurchasedLot[]> {
    this.operations.push("lotsOfPurchaseLines");
    return this.lots
      .filter(
        (lot) => lot.locationId === locationId && purchaseLineIds.includes(lot.purchaseLineId),
      )
      .map(({ lotId, purchaseLineId, productId, splitFromLotId }) => ({
        lotId,
        purchaseLineId,
        productId,
        splitFromLotId: splitFromLotId ?? null,
      }));
  }

  async splittableLot(lotId: string): Promise<SplittableLot | null> {
    this.operations.push("splittableLot");
    const lot = this.lots.find((candidate) => candidate.lotId === lotId);
    return lot
      ? {
          remaining: lot.remaining,
          purchasedOn: lot.purchasedOn,
          createdAt: lot.createdAt ?? new Date(0),
          costIncomplete: lot.costIncomplete ?? false,
        }
      : null;
  }

  async recordMovement(movement: NewStockMovement): Promise<string> {
    this.operations.push(`recordMovement:${movement.kind}`);
    this.movements.push({ ...movement });
    return `movement-${this.movements.length}`;
  }

  async recordSplitLot(lot: NewSplitLot): Promise<string> {
    this.operations.push("recordSplitLot");
    const lotId = `lot-split-${this.lots.length + 1}`;
    this.lots.push({
      lotId,
      purchaseLineId: lot.purchaseLineId,
      productId: lot.productId,
      locationId: lot.locationId,
      splitFromLotId: lot.splitFromLotId,
      expiresOn: lot.expiresOn,
      purchasedOn: lot.purchasedOn,
      createdAt: lot.createdAt,
      costIncomplete: lot.costIncomplete,
      quantityReceived: lot.quantityReceived,
      nameOrder: Math.max(0, ...this.lots.map((candidate) => candidate.nameOrder)) + 1,
      givenNumber: null,
      remaining: 0,
    });
    if (lot.cost) {
      this.costs.set(lotId, { ...lot.cost });
    }
    return lotId;
  }

  async allocateToLot(allocation: LotAllocation): Promise<void> {
    this.operations.push("allocateToLot");
    this.allocations.push({ ...allocation });
    for (const lot of this.lots) {
      if (lot.lotId === allocation.lotId) {
        lot.remaining += allocation.quantity;
      }
    }
  }

  async setLotExpiry(lotId: string, expiresOn: string | null): Promise<void> {
    this.operations.push("setLotExpiry");
    for (const lot of this.lots) {
      if (lot.lotId === lotId) {
        lot.expiresOn = expiresOn;
      }
    }
  }

  async costOfLot(lotId: string): Promise<LotCost | null> {
    this.operations.push("costOfLot");
    return this.costs.get(lotId) ?? null;
  }

  async recordLotCostChange(change: FakeLotCostChange): Promise<void> {
    this.operations.push("recordLotCostChange");
    this.costChanges.push({ ...change, previous: { ...change.previous } });
  }

  async setLotCost(lotId: string, cost: LotCost): Promise<void> {
    this.operations.push("setLotCost");
    this.costs.set(lotId, { ...cost });
  }

  async namingOfPurchasedLots(
    locationId: string,
    productIds: readonly string[],
  ): Promise<PurchasedLotNaming[]> {
    this.operations.push("namingOfPurchasedLots");
    return this.lots
      .filter((lot) => lot.locationId === locationId && productIds.includes(lot.productId))
      .map(({ lotId, productId, purchasedOn, nameOrder, givenNumber }) => ({
        lotId,
        productId,
        purchasedOn,
        nameOrder,
        givenNumber,
      }));
  }

  async giveLotNumbers(numbers: ReadonlyMap<string, number>): Promise<void> {
    this.operations.push("giveLotNumbers");
    for (const lot of this.lots) {
      lot.givenNumber = numbers.get(lot.lotId) ?? lot.givenNumber;
    }
  }

  nameFacts(): LotNameFacts[] {
    return this.lots.map(
      ({ lotId, productId, locationId, nameOrder, givenNumber, purchasedOn }) => ({
        lotId,
        productId,
        locationId,
        nameOrder,
        givenNumber,
        origin: { kind: "purchase", purchasedOn },
      }),
    );
  }

  async renameLotsToPurchaseDay(lotIds: readonly string[], purchasedOn: string): Promise<void> {
    this.operations.push("renameLotsToPurchaseDay");
    let lastNameOrder = Math.max(0, ...this.lots.map((lot) => lot.nameOrder));
    for (const lot of this.lots) {
      if (lotIds.includes(lot.lotId)) {
        lot.purchasedOn = purchasedOn;
        lot.givenNumber = null;
        lastNameOrder += 1;
        lot.nameOrder = lastNameOrder;
      }
    }
  }
}
