import {
  type AdjustmentReason,
  isListedInStockBalances,
  isLotInStock,
  type LossReason,
  type ManualStockMovementKind,
  type SaleUnit,
} from "@purosur/domain";
import type {
  LedgerAtMoment,
  LedgerLot,
  LotInStock,
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
  lots,
  products,
  purchaseLines,
  purchases,
  stockBalances,
  stockCountLots,
  stockCounts,
  stockMovements,
  suppliers,
} from "../platform/db/schema.js";
import { appliedDeltaAfter, lotAllocationsAfter } from "./stock-ledger-queries.js";

const stockProductColumns = {
  id: products.id,
  name: products.name,
  categoryId: products.categoryId,
  categoryName: categories.name,
  saleUnit: products.saleUnit,
  active: products.active,
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

async function productLotsOf<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  key: ProductStockKey,
): Promise<LedgerLot[]> {
  return db
    .select({
      id: lots.id,
      lotNumber: lots.lotNumber,
      technical: lots.technical,
      expiresOn: lots.expiresOn,
      purchasedOn: lots.purchasedOn,
      receivedAt: lots.createdAt,
      remaining: lots.remaining,
    })
    .from(lots)
    .where(and(eq(lots.productId, key.productId), eq(lots.locationId, key.locationId)));
}

export class DrizzleStockReader<TQueryResult extends PgQueryResultHKT>
  implements StockLedgerReader, StockListReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async product(productId: string): Promise<StockProduct | undefined> {
    const [product] = await this.db
      .select(stockProductColumns)
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.id, productId));
    return product && { ...product, saleUnit: product.saleUnit as SaleUnit };
  }

  ledgerAt(key: ProductStockKey, at: Date): Promise<LedgerAtMoment> {
    return this.db.transaction(
      async (tx) => ({
        balance: await currentBalance(tx, key),
        appliedAfterCount: await appliedDeltaAfter(tx, key, at),
        lots: await productLotsOf(tx, key),
        lotAllocationsAfter: await lotAllocationsAfter(tx, key, at),
      }),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  async products(): Promise<StockProduct[]> {
    const rows = await this.db
      .select(stockProductColumns)
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .orderBy(asc(products.name), asc(products.id));
    return rows.map((row) => ({ ...row, saleUnit: row.saleUnit as SaleUnit }));
  }

  async stockLevels(locationId: string): Promise<StockLevel[]> {
    const rows = await this.db
      .select({
        ...stockProductColumns,
        hasMoved: sql<boolean>`${stockBalances.productId} is not null`,
        balance: sql<number>`coalesce(${stockBalances.quantity}, 0)`.mapWith(Number),
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(
        stockBalances,
        and(eq(stockBalances.productId, products.id), eq(stockBalances.locationId, locationId)),
      )
      .orderBy(asc(products.name), asc(products.id));
    const lotsByProduct = new Map<string, LotInStock[]>();
    for (const { productId, ...lot } of await this.lotsInStockAt(locationId)) {
      lotsByProduct.set(productId, [...(lotsByProduct.get(productId) ?? []), lot]);
    }
    return rows.filter(isListedInStockBalances).map((row) => ({
      ...row,
      saleUnit: row.saleUnit as SaleUnit,
      lots: lotsByProduct.get(row.id) ?? [],
    }));
  }

  private async lotsInStockAt(locationId: string): Promise<(LotInStock & { productId: string })[]> {
    const rows = await this.db
      .select({
        id: lots.id,
        productId: lots.productId,
        lotNumber: lots.lotNumber,
        expiresOn: lots.expiresOn,
        purchasedOn: lots.purchasedOn,
        supplierName: suppliers.name,
        remaining: lots.remaining,
        costIncomplete: lots.costIncomplete,
        costTotalCents: lots.costTotalCents,
        costQuantity: lots.costQuantity,
      })
      .from(lots)
      .leftJoin(purchaseLines, eq(purchaseLines.id, lots.purchaseLineId))
      .leftJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
      .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .where(eq(lots.locationId, locationId));
    return rows
      .filter(isLotInStock)
      .map(({ purchasedOn, supplierName, costTotalCents, costQuantity, ...lot }) => ({
        ...lot,
        purchase:
          purchasedOn === null || supplierName === null ? null : { purchasedOn, supplierName },
        cost:
          costTotalCents === null || costQuantity === null
            ? null
            : { totalCents: costTotalCents, quantity: costQuantity },
      }));
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
        lotCount: sql<number>`(
          select count(*) from ${stockCountLots}
          where ${stockCountLots.movementId} = ${stockMovements.id}
        )`.mapWith(Number),
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
    return rows.map(({ supersededByCountId, lotCount, ...row }) => ({
      ...row,
      saleUnit: row.saleUnit as SaleUnit,
      superseded: supersededByCountId !== null,
      lotCount: lotCount === 0 ? null : lotCount,
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
