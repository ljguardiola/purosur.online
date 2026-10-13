import type { SaleUnit } from "@purosur/domain";
import type {
  CountedLot,
  CoveringCount,
  LockProductStockResult,
  LotAllocation,
  NewInitialCountLot,
  NewLot,
  NewStockCount,
  NewStockMovement,
  OpeningCountLot,
  ProductStockKey,
  StockLot,
  StockStore,
  StockStoreTransaction,
} from "@purosur/domain/stock/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  lotAllocations,
  lots,
  products,
  stockBalances,
  stockCountLots,
  stockCounts,
  stockMovements,
} from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
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

export class DrizzleStockStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements StockStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges;

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

  async recordMovement(movement: NewStockMovement): Promise<string> {
    const [recorded] = await this.tx
      .insert(stockMovements)
      .values(movement)
      .returning({ id: stockMovements.id });
    if (!recorded) {
      throw new Error("inserting the stock movement returned no row");
    }
    this.pending.note({
      entity: "stock_movement",
      entityId: recorded.id,
      version: STOCK_MOVEMENT_VERSION,
      op: "insert",
      locationId: movement.locationId,
    });
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

  async recordInitialCountLot(lot: NewInitialCountLot): Promise<string> {
    const [recorded] = await this.tx
      .insert(lots)
      .values({ ...lot, costIncomplete: true })
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
