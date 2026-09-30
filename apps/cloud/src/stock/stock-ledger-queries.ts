import type { CoveringCount, ProductStockKey } from "@purosur/domain/stock/use-cases";
import { and, asc, eq, gt, gte, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { categories, products, stockBalances, stockMovements } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";

function movementsOf(key: ProductStockKey) {
  return and(
    eq(stockMovements.productId, key.productId),
    eq(stockMovements.locationId, key.locationId),
  );
}

export async function earliestCountAtOrAfter<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  key: ProductStockKey,
  at: Date,
): Promise<CoveringCount | undefined> {
  const [count] = await db
    .select({ movementId: stockMovements.id, occurredAt: stockMovements.occurredAt })
    .from(stockMovements)
    .where(
      and(movementsOf(key), eq(stockMovements.kind, "count"), gte(stockMovements.occurredAt, at)),
    )
    .orderBy(asc(stockMovements.occurredAt))
    .limit(1);
  return count;
}

export async function appliedDeltaAfter<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  key: ProductStockKey,
  at: Date,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${stockMovements.delta}), 0)`.mapWith(Number),
    })
    .from(stockMovements)
    .where(
      and(
        movementsOf(key),
        isNull(stockMovements.supersededByCountId),
        gt(stockMovements.occurredAt, at),
      ),
    );
  return row?.total ?? 0;
}

export async function findActiveProduct<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  productId: string,
) {
  if (!UUID_PATTERN.test(productId)) {
    return undefined;
  }
  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
      saleUnit: products.saleUnit,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.id, productId), eq(products.active, true)));
  return product;
}

export async function currentBalance<TQueryResult extends PgQueryResultHKT>(
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
