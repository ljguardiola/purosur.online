import type { SaleUnit } from "@purosur/domain";
import type {
  PriceReviewProduct,
  PriceReviewProductReader,
} from "@purosur/domain/pricing/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { brands, categories, products } from "../platform/db/schema.js";
import { netContentRow } from "./net-content-row.js";
import { productActivityCondition } from "./product-activity-condition.js";

export class DrizzlePriceReviewProductReader<TQueryResult extends PgQueryResultHKT>
  implements PriceReviewProductReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async activeProducts(): Promise<PriceReviewProduct[]> {
    const rows = await this.db
      .select({
        id: products.id,
        name: products.name,
        categoryId: products.categoryId,
        categoryName: categories.name,
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        saleUnit: products.saleUnit,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(productActivityCondition("active"));
    return rows.map(({ netContentQuantity, netContentUnit, ...row }) => ({
      ...row,
      netContent: netContentRow({ netContentQuantity, netContentUnit }),
      saleUnit: row.saleUnit as SaleUnit,
    }));
  }
}
