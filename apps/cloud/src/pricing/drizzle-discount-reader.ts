import type { DiscountReader, StoredDiscount } from "@purosur/domain/pricing/use-cases";
import { asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import { brands, categories, discounts, products, tags } from "../platform/db/schema.js";
import { storedBenefit } from "./drizzle-discount-store.js";

interface ProductIdentity {
  brandName: string | null;
  netContentQuantity: number | null;
  netContentUnit: string | null;
}

function targetOf(
  discount: typeof discounts.$inferSelect,
  name: string,
  product: ProductIdentity,
): StoredDiscount["target"] {
  if (discount.productId !== null) {
    return {
      kind: "PRODUCT",
      id: discount.productId,
      name,
      brandName: product.brandName,
      netContent: netContentRow(product),
    };
  }
  if (discount.categoryId !== null) {
    return { kind: "CATEGORY", id: discount.categoryId, name, brandName: null, netContent: null };
  }
  if (discount.tagId !== null) {
    return { kind: "TAG", id: discount.tagId, name, brandName: null, netContent: null };
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
            brandName: brands.name,
            netContentQuantity: products.netContentQuantity,
            netContentUnit: products.netContentUnit,
          })
          .from(discounts)
          .leftJoin(products, eq(products.id, discounts.productId))
          .leftJoin(brands, eq(brands.id, products.brandId))
          .leftJoin(categories, eq(categories.id, discounts.categoryId))
          .leftJoin(tags, eq(tags.id, discounts.tagId))
          .where(discountId === undefined ? undefined : eq(discounts.id, discountId))
          .orderBy(asc(discounts.name), asc(discounts.id));

        return rows.map(({ discount, targetName, ...product }) => ({
          id: discount.id,
          name: discount.name,
          benefit: storedBenefit(discount),
          target: targetOf(discount, targetName, product),
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
