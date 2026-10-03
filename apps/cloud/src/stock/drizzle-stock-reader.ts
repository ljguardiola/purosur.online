import type {
  AdjustmentReason,
  LossReason,
  ManualStockMovementKind,
  SaleUnit,
} from "@purosur/domain";
import type {
  LedgerAtMoment,
  ProductStockKey,
  RecordedStockCount,
  RecordedStockMovement,
  StockLedgerReader,
  StockLevel,
  StockListReader,
  StockMovementsQuery,
  StockPeriodQuery,
  StockProduct,
} from "@purosur/domain/stock/use-cases";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  categories,
  products,
  stockBalances,
  stockCounts,
  stockMovements,
} from "../platform/db/schema.js";
import { appliedDeltaAfter } from "./stock-ledger-queries.js";

const stockProductColumns = {
  id: products.id,
  name: products.name,
  categoryId: products.categoryId,
  categoryName: categories.name,
  saleUnit: products.saleUnit,
};

async function currentBalance<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  key: ProductStockKey,
): Promise<number> {
  const [balance] = await db
    .select({ quantity: stockBalances.quantity })
    .from(stockBalances)
    .where(
      and(eq(stockBalances.productId, key.productId), eq(stockBalances.locationId, key.locationId)),
    );
  return balance?.quantity ?? 0;
}

export class DrizzleStockReader<TQueryResult extends PgQueryResultHKT>
  implements StockLedgerReader, StockListReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async activeProduct(productId: string): Promise<StockProduct | undefined> {
    const [product] = await this.db
      .select(stockProductColumns)
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(eq(products.id, productId), eq(products.active, true)));
    return product && { ...product, saleUnit: product.saleUnit as SaleUnit };
  }

  ledgerAt(key: ProductStockKey, at: Date): Promise<LedgerAtMoment> {
    return this.db.transaction(
      async (tx) => ({
        balance: await currentBalance(tx, key),
        appliedAfterCount: await appliedDeltaAfter(tx, key, at),
      }),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  async activeProducts(): Promise<StockProduct[]> {
    const rows = await this.db
      .select(stockProductColumns)
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.active, true))
      .orderBy(asc(products.name), asc(products.id));
    return rows.map((row) => ({ ...row, saleUnit: row.saleUnit as SaleUnit }));
  }

  async stockLevels(locationId: string): Promise<StockLevel[]> {
    const rows = await this.db
      .select({
        ...stockProductColumns,
        balance: sql<number>`coalesce(${stockBalances.quantity}, 0)`.mapWith(Number),
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(
        stockBalances,
        and(eq(stockBalances.productId, products.id), eq(stockBalances.locationId, locationId)),
      )
      .where(eq(products.active, true))
      .orderBy(asc(products.name), asc(products.id));
    return rows.map((row) => ({ ...row, saleUnit: row.saleUnit as SaleUnit }));
  }

  async counts(query: StockPeriodQuery): Promise<RecordedStockCount[]> {
    const rows = await this.db
      .select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        productName: products.name,
        categoryId: products.categoryId,
        categoryName: categories.name,
        saleUnit: products.saleUnit,
        occurredAt: stockMovements.occurredAt,
        expected: stockCounts.expected,
        counted: stockCounts.counted,
        delta: stockMovements.delta,
        supersededByCountId: stockMovements.supersededByCountId,
      })
      .from(stockMovements)
      .innerJoin(stockCounts, eq(stockCounts.movementId, stockMovements.id))
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(stockMovements.locationId, query.locationId),
          gte(stockMovements.occurredAt, query.since),
        ),
      )
      .orderBy(desc(stockMovements.occurredAt), desc(stockMovements.id));
    return rows.map(({ supersededByCountId, ...row }) => ({
      ...row,
      saleUnit: row.saleUnit as SaleUnit,
      superseded: supersededByCountId !== null,
    }));
  }

  async movements(query: StockMovementsQuery): Promise<RecordedStockMovement[]> {
    const rows = await this.db
      .select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        productName: products.name,
        categoryName: categories.name,
        saleUnit: products.saleUnit,
        kind: stockMovements.kind,
        reason: stockMovements.reason,
        delta: stockMovements.delta,
        occurredAt: stockMovements.occurredAt,
        supersededByCountId: stockMovements.supersededByCountId,
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(stockMovements.locationId, query.locationId),
          inArray(stockMovements.kind, [...query.kinds]),
          gte(stockMovements.occurredAt, query.since),
        ),
      )
      .orderBy(desc(stockMovements.occurredAt), desc(stockMovements.id));
    return rows.map(({ supersededByCountId, ...row }) => ({
      ...row,
      saleUnit: row.saleUnit as SaleUnit,
      kind: row.kind as ManualStockMovementKind,
      reason: row.reason as LossReason | AdjustmentReason,
      superseded: supersededByCountId !== null,
    }));
  }
}
