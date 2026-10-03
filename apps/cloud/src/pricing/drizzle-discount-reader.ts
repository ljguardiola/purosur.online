import type { DiscountReader, StoredDiscount } from "@purosur/domain/pricing/use-cases";
import { asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { categories, discounts, products, tags } from "../platform/db/schema.js";
import { storedBenefit } from "./drizzle-discount-store.js";

function targetOf(discount: typeof discounts.$inferSelect, name: string): StoredDiscount["target"] {
  if (discount.productId !== null) {
    return { kind: "PRODUCT", id: discount.productId, name };
  }
  if (discount.categoryId !== null) {
    return { kind: "CATEGORY", id: discount.categoryId, name };
  }
  if (discount.tagId !== null) {
    return { kind: "TAG", id: discount.tagId, name };
  }
  throw new Error(`discount ${discount.id} has no target`);
}

export class DrizzleDiscountReader<TQueryResult extends PgQueryResultHKT>
  implements DiscountReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  discounts(): Promise<StoredDiscount[]> {
    return this.read();
  }

  async discount(id: string): Promise<StoredDiscount | undefined> {
    const [found] = await this.read(id);
    return found;
  }

  private read(discountId?: string): Promise<StoredDiscount[]> {
    return this.db.transaction(
      async (tx) => {
        const rows = await tx
          .select({
            discount: discounts,
            targetName: sql<string>`coalesce(${products.name}, ${categories.name}, ${tags.name})`,
          })
          .from(discounts)
          .leftJoin(products, eq(products.id, discounts.productId))
          .leftJoin(categories, eq(categories.id, discounts.categoryId))
          .leftJoin(tags, eq(tags.id, discounts.tagId))
          .where(discountId === undefined ? undefined : eq(discounts.id, discountId))
          .orderBy(asc(discounts.name), asc(discounts.id));

        return rows.map(({ discount, targetName }) => ({
          id: discount.id,
          name: discount.name,
          benefit: storedBenefit(discount),
          target: targetOf(discount, targetName),
          validFrom: discount.validFrom,
          validTo: discount.validTo,
          weekdays: discount.weekdays,
          active: discount.active,
          version: discount.version,
        }));
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
