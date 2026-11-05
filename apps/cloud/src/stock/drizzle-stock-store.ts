import { type SaleUnit, stockMovementReachesRegisters } from "@purosur/domain";
import type {
  CountedLot,
  CoveringCount,
  LoadedSupplierPrice,
  LockProductStockResult,
  LotAllocation,
  LotCostChangeRecord,
  NewInitialCountLot,
  NewLot,
  NewSplitLot,
  NewStockCount,
  NewStockMovement,
  OpeningCountLot,
  ProductStockKey,
  PurchasedLot,
  PurchasedLotNaming,
  PurchasedLotStoreTransaction,
  SplittableLot,
  StockLot,
  StockStore,
  StockStoreTransaction,
} from "@purosur/domain/stock/use-cases";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  lotAllocations,
  lotCostChanges,
  lots,
  products,
  stockBalances,
  stockCountLots,
  stockCounts,
  stockMovements,
} from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import { loadedSupplierPricesOf } from "./loaded-supplier-prices.js";
import {
  appliedDeltaAfter,
  earliestCountAtOrAfter,
  lotAllocationsAfter,
} from "./stock-ledger-queries.js";
import { STOCK_MOVEMENT_VERSION } from "./stock-movement-version.js";

function balanceOf(key: ProductStockKey) {
  return and(
    eq(stockBalances.productId, key.productId),
    eq(stockBalances.locationId, key.locationId),
  );
}

type LotCost = LotCostChangeRecord["previous"];

export class DrizzleStockStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements StockStoreTransaction, PurchasedLotStoreTransaction
{
  protected readonly tx: PgDatabase<TQueryResult>;
  protected readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async lockProductStock(key: ProductStockKey): Promise<LockProductStockResult> {
    const [product] = await this.tx
      .select({ saleUnit: products.saleUnit })
      .from(products)
      .where(eq(products.id, key.productId));
    if (!product) {
      return { kind: "not_found" };
    }
    await this.tx.insert(stockBalances).values(key).onConflictDoNothing();
    const [balance] = await this.tx
      .select({ quantity: stockBalances.quantity })
      .from(stockBalances)
      .where(balanceOf(key))
      .for("update");
    if (!balance) {
      throw new Error("locking the product's stock balance returned no row");
    }
    return {
      kind: "locked",
      saleUnit: product.saleUnit as SaleUnit,
      balance: balance.quantity,
    };
  }

  earliestCountAtOrAfter(key: ProductStockKey, at: Date): Promise<CoveringCount | undefined> {
    return earliestCountAtOrAfter(this.tx, key, at);
  }

  appliedDeltaAfter(key: ProductStockKey, at: Date): Promise<number> {
    return appliedDeltaAfter(this.tx, key, at);
  }

  lotAllocationsAfter(key: ProductStockKey, at: Date): Promise<Map<string, number>> {
    return lotAllocationsAfter(this.tx, key, at);
  }

  async saleLineLotAllocations(
    key: ProductStockKey,
    saleLineId: string,
  ): Promise<{ lotId: string; quantity: number }[]> {
    return this.tx
      .select({ lotId: lotAllocations.lotId, quantity: lotAllocations.quantity })
      .from(lotAllocations)
      .innerJoin(stockMovements, eq(stockMovements.id, lotAllocations.movementId))
      .where(
        and(
          eq(stockMovements.kind, "sale"),
          eq(stockMovements.saleLineId, saleLineId),
          eq(stockMovements.productId, key.productId),
          eq(stockMovements.locationId, key.locationId),
        ),
      );
  }

  async saleLineReturnedLotAllocations(
    key: ProductStockKey,
    saleLineId: string,
  ): Promise<{ lotId: string; quantity: number }[]> {
    return this.tx
      .select({ lotId: lotAllocations.lotId, quantity: lotAllocations.quantity })
      .from(lotAllocations)
      .innerJoin(stockMovements, eq(stockMovements.id, lotAllocations.movementId))
      .where(
        and(
          or(
            eq(stockMovements.kind, "return"),
            and(eq(stockMovements.kind, "loss"), eq(stockMovements.reason, "return_discard")),
          ),
          eq(stockMovements.saleLineId, saleLineId),
          eq(stockMovements.productId, key.productId),
          eq(stockMovements.locationId, key.locationId),
        ),
      );
  }

  async recordMovement(movement: NewStockMovement): Promise<string> {
    const [recorded] = await this.tx
      .insert(stockMovements)
      .values(movement)
      .returning({ id: stockMovements.id });
    if (!recorded) {
      throw new Error("inserting the stock movement returned no row");
    }
    if (stockMovementReachesRegisters(movement.kind)) {
      this.pending.note({
        entity: "stock_movement",
        entityId: recorded.id,
        version: STOCK_MOVEMENT_VERSION,
        op: "insert",
        locationId: movement.locationId,
      });
    }
    return recorded.id;
  }

  async recordCount(count: NewStockCount): Promise<void> {
    await this.tx.insert(stockCounts).values(count);
  }

  async recordCountedLots(movementId: string, countedLots: readonly CountedLot[]): Promise<void> {
    await this.tx.insert(stockCountLots).values(countedLots.map((lot) => ({ movementId, ...lot })));
  }

  async recordLot(lot: NewLot): Promise<string> {
    const [recorded] = await this.tx.insert(lots).values(lot).returning({ id: lots.id });
    if (!recorded) {
      throw new Error("inserting the lot returned no row");
    }
    return recorded.id;
  }

  async loadedSupplierPrices(productId: string): Promise<LoadedSupplierPrice[]> {
    return (await loadedSupplierPricesOf(this.tx, [productId])).get(productId) ?? [];
  }

  async recordInitialCountLot({ cost, ...lot }: NewInitialCountLot): Promise<string> {
    const [recorded] = await this.tx
      .insert(lots)
      .values({
        ...lot,
        costIncomplete: cost === null,
        costTotalCents: cost?.totalCents ?? null,
        costQuantity: cost?.quantity ?? null,
      })
      .returning({ id: lots.id });
    if (!recorded) {
      throw new Error("inserting the initial count lot returned no row");
    }
    return recorded.id;
  }

  async openingCountLot(
    locationId: string,
    movementId: string,
  ): Promise<OpeningCountLot | undefined> {
    const [found] = await this.tx
      .select({
        lotId: lots.id,
        productId: lots.productId,
        counted: lots.quantityReceived,
        withdrawn: lots.withdrawn,
      })
      .from(lots)
      .where(and(eq(lots.originMovementId, movementId), eq(lots.locationId, locationId)));
    return found;
  }

  async markOpeningCountWithdrawn(lotId: string): Promise<void> {
    const [updated] = await this.tx
      .update(lots)
      .set({ withdrawn: true })
      .where(eq(lots.id, lotId))
      .returning({ id: lots.id });
    if (!updated) {
      throw new Error("marking the initial count lot as withdrawn updated no row");
    }
  }

  async lotsOfPurchaseLines(
    locationId: string,
    purchaseLineIds: readonly string[],
  ): Promise<PurchasedLot[]> {
    if (purchaseLineIds.length === 0) {
      return [];
    }
    const found = await this.tx
      .select({
        lotId: lots.id,
        purchaseLineId: lots.purchaseLineId,
        productId: lots.productId,
        splitFromLotId: lots.splitFromLotId,
      })
      .from(lots)
      .where(
        and(eq(lots.locationId, locationId), inArray(lots.purchaseLineId, [...purchaseLineIds])),
      );
    return found.flatMap(({ purchaseLineId, ...lot }) =>
      purchaseLineId === null ? [] : [{ ...lot, purchaseLineId }],
    );
  }

  async splittableLot(lotId: string): Promise<SplittableLot | null> {
    const [lot] = await this.tx
      .select({
        remaining: lots.remaining,
        purchasedOn: lots.purchasedOn,
        createdAt: lots.createdAt,
        costIncomplete: lots.costIncomplete,
      })
      .from(lots)
      .where(eq(lots.id, lotId));
    return lot?.purchasedOn == null ? null : { ...lot, purchasedOn: lot.purchasedOn };
  }

  async recordSplitLot({ cost, ...lot }: NewSplitLot): Promise<string> {
    const [recorded] = await this.tx
      .insert(lots)
      .values({
        ...lot,
        costTotalCents: cost?.totalCents ?? null,
        costQuantity: cost?.quantity ?? null,
      })
      .returning({ id: lots.id });
    if (!recorded) {
      throw new Error("inserting the split lot returned no row");
    }
    return recorded.id;
  }

  async setLotExpiry(lotId: string, expiresOn: string | null): Promise<void> {
    await this.tx.update(lots).set({ expiresOn }).where(eq(lots.id, lotId));
  }

  async costOfLot(lotId: string): Promise<LotCost | null> {
    const [lot] = await this.tx
      .select({ totalCents: lots.costTotalCents, quantity: lots.costQuantity })
      .from(lots)
      .where(eq(lots.id, lotId));
    return lot?.totalCents == null || lot.quantity === null
      ? null
      : { totalCents: lot.totalCents, quantity: lot.quantity };
  }

  async recordLotCostChange({ lotId, changedAt, previous }: LotCostChangeRecord): Promise<void> {
    await this.tx.insert(lotCostChanges).values({
      lotId,
      changedAt,
      previousCostTotalCents: previous.totalCents,
      previousCostQuantity: previous.quantity,
    });
  }

  async setLotCost(lotId: string, cost: LotCost): Promise<void> {
    await this.tx
      .update(lots)
      .set({ costTotalCents: cost.totalCents, costQuantity: cost.quantity })
      .where(eq(lots.id, lotId));
  }

  async namingOfPurchasedLots(
    locationId: string,
    productIds: readonly string[],
  ): Promise<PurchasedLotNaming[]> {
    if (productIds.length === 0) {
      return [];
    }
    const found = await this.tx
      .select({
        lotId: lots.id,
        productId: lots.productId,
        purchasedOn: lots.purchasedOn,
        nameOrder: lots.nameOrder,
        givenNumber: lots.nameNumber,
      })
      .from(lots)
      .where(
        and(
          eq(lots.locationId, locationId),
          inArray(lots.productId, [...productIds]),
          isNotNull(lots.purchaseLineId),
        ),
      );
    return found.flatMap(({ purchasedOn, ...lot }) =>
      purchasedOn === null ? [] : [{ ...lot, purchasedOn }],
    );
  }

  async giveLotNumbers(numbers: ReadonlyMap<string, number>): Promise<void> {
    for (const [lotId, nameNumber] of numbers) {
      await this.tx.update(lots).set({ nameNumber }).where(eq(lots.id, lotId));
    }
  }

  async renameLotsToPurchaseDay(lotIds: readonly string[], purchasedOn: string): Promise<void> {
    if (lotIds.length === 0) {
      return;
    }
    await this.tx
      .update(lots)
      .set({ purchasedOn, nameOrder: sql`nextval('lot_name_order_sequence')`, nameNumber: null })
      .where(inArray(lots.id, [...lotIds]));
  }

  async lotProduct(lotId: string, locationId: string): Promise<string | undefined> {
    const [found] = await this.tx
      .select({ productId: lots.productId })
      .from(lots)
      .where(and(eq(lots.id, lotId), eq(lots.locationId, locationId)));
    return found?.productId;
  }

  async productLots(key: ProductStockKey): Promise<StockLot[]> {
    const found = await this.tx
      .select({
        id: lots.id,
        technical: lots.technical,
        expiresOn: lots.expiresOn,
        purchasedOn: lots.purchasedOn,
        receivedAt: lots.createdAt,
        remaining: lots.remaining,
      })
      .from(lots)
      .where(and(eq(lots.productId, key.productId), eq(lots.locationId, key.locationId)));
    return found;
  }

  async openTechnicalLot(key: ProductStockKey): Promise<string> {
    const [opened] = await this.tx
      .insert(lots)
      .values({ ...key, technical: true, costIncomplete: true, quantityReceived: 0 })
      .returning({ id: lots.id });
    if (!opened) {
      throw new Error("inserting the technical lot returned no row");
    }
    return opened.id;
  }

  async allocateToLot(allocation: LotAllocation): Promise<void> {
    const [updated] = await this.tx
      .update(lots)
      .set({ remaining: sql`${lots.remaining} + ${allocation.quantity}` })
      .where(eq(lots.id, allocation.lotId))
      .returning({ id: lots.id });
    if (!updated) {
      throw new Error("adding to the lot's remaining quantity updated no row");
    }
    await this.tx.insert(lotAllocations).values(allocation);
  }

  async addToBalance(key: ProductStockKey, delta: number): Promise<number> {
    const [updated] = await this.tx
      .update(stockBalances)
      .set({ quantity: sql`${stockBalances.quantity} + ${delta}` })
      .where(balanceOf(key))
      .returning({ quantity: stockBalances.quantity });
    if (!updated) {
      throw new Error("adding to the product's stock balance updated no row");
    }
    return updated.quantity;
  }
}

export class DrizzleStockStore<TQueryResult extends PgQueryResultHKT> implements StockStore {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(work: (tx: StockStoreTransaction) => Promise<TOutcome>): Promise<TOutcome> {
    return withPendingChanges(this.db, undefined, (tx, pending) =>
      work(new DrizzleStockStoreTransaction(tx, pending)),
    );
  }
}
