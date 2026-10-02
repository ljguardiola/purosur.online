import type { SaleUnit } from "@purosur/domain";
import type {
  DiscountTargetCandidates,
  DiscountTargetReader,
} from "@purosur/domain/pricing/use-cases";
import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import { brands, categories, productBarcodes, products, tags } from "../platform/db/schema.js";

export class DrizzleDiscountTargetReader<TQueryResult extends PgQueryResultHKT>
  implements DiscountTargetReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  // Repeatable-read: the four reads see one snapshot, so a barcode never belongs to a product
  // the same response doesn't list.
  targetCandidates(): Promise<DiscountTargetCandidates> {
    return this.db.transaction(
      async (tx) => {
        const [productRows, barcodeRows, categoryRows, tagRows] = await Promise.all([
          tx
            .select({
              id: products.id,
              name: products.name,
              active: products.active,
              saleUnit: products.saleUnit,
              brandName: brands.name,
              netContentQuantity: products.netContentQuantity,
              netContentUnit: products.netContentUnit,
            })
            .from(products)
            .leftJoin(brands, eq(brands.id, products.brandId))
            .orderBy(asc(products.name)),
          tx
            .select({ productId: productBarcodes.productId, code: productBarcodes.code })
            .from(productBarcodes)
            .where(eq(productBarcodes.active, true))
            .orderBy(asc(productBarcodes.position)),
          tx
            .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
            .from(categories)
            .orderBy(asc(categories.name)),
          tx
            .select({ id: tags.id, name: tags.name, active: tags.active })
            .from(tags)
            .orderBy(asc(tags.name)),
        ]);
        const barcodesByProduct = new Map<string, string[]>();
        for (const { productId, code } of barcodeRows) {
          barcodesByProduct.set(productId, [...(barcodesByProduct.get(productId) ?? []), code]);
        }
        return {
          products: productRows.map((row) => ({
            id: row.id,
            name: row.name,
            active: row.active,
            saleUnit: row.saleUnit as SaleUnit,
            brandName: row.brandName,
            netContent: netContentRow(row),
            barcodes: barcodesByProduct.get(row.id) ?? [],
          })),
          categories: categoryRows,
          tags: tagRows,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
