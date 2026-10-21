import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { categories, products } from "../../platform/db/schema.js";
import type { CompletedSale } from "../../sync/test-support/synced-facts.js";

type Db = PgDatabase<PgQueryResultHKT>;
type SoldLine = CompletedSale["lines"][number];

export function aSoldLine(
  productId: string,
  productName: string,
  quantity: number,
  lineTotal: number,
  weightSource: SoldLine["weightSource"] = null,
): SoldLine {
  return {
    id: randomUUID(),
    productId,
    productName,
    weightSource,
    manualAdjustment: null,
    quantity,
    listUnitPrice: lineTotal,
    priceListId: randomUUID(),
    promotionId: null,
    discountAmount: 0,
    saleDiscountShare: 0,
    promotions: [],
    lineTotal,
  };
}

export async function insertCategoryNamed(
  db: Db,
  name: string,
  parentId?: string,
): Promise<string> {
  const [category] = await db
    .insert(categories)
    .values({ name, parentId })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return category.id;
}

export async function insertProductIn(db: Db, categoryId: string, name: string): Promise<string> {
  const [product] = await db
    .insert(products)
    .values({ name, categoryId, saleUnit: "UNIT" })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  return product.id;
}

export function withPromotion(
  line: SoldLine,
  promotionId: string,
  discountAmount: number,
): SoldLine {
  return { ...line, promotionId, discountAmount };
}

export function withManualAdjustment(
  line: SoldLine,
  manualAdjustment: NonNullable<SoldLine["manualAdjustment"]>,
): SoldLine {
  return { ...line, manualAdjustment };
}
