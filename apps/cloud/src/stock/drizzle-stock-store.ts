import type { SaleUnit } from "@purosur/domain";
import type {
  CoveringCount,
  LockProductStockResult,
  NewStockCount,
  NewStockMovement,
  ProductStockKey,
  StockStore,
  StockStoreTransaction,
} from "@purosur/domain/stock/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { products, stockBalances, stockCounts, stockMovements } from "../platform/db/schema.js";
import { appliedDeltaAfter, earliestCountAtOrAfter } from "./stock-ledger-queries.js";

function balanceOf(key: ProductStockKey) {
  return and(
    eq(stockBalances.productId, key.productId),
    eq(stockBalances.locationId, key.locationId),
  );
}

class DrizzleStockStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements StockStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async lockProductStock(key: ProductStockKey): Promise<LockProductStockResult> {
    const [product] = await this.tx
      .select({ saleUnit: products.saleUnit })
      .from(products)
      .where(and(eq(products.id, key.productId), eq(products.active, true)));
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

  async recordMovement(movement: NewStockMovement): Promise<string> {
    const [recorded] = await this.tx
      .insert(stockMovements)
      .values(movement)
      .returning({ id: stockMovements.id });
    if (!recorded) {
      throw new Error("inserting the stock movement returned no row");
    }
    return recorded.id;
  }

  async recordCount(count: NewStockCount): Promise<void> {
    await this.tx.insert(stockCounts).values(count);
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
    return this.db.transaction((tx) => work(new DrizzleStockStoreTransaction(tx)));
  }
}
