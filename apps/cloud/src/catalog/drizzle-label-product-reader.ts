import type { LabelProduct, LabelProductReader } from "@purosur/domain/catalog/use-cases";
import { asc, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { productBarcodes, products } from "../platform/db/schema.js";

export class DrizzleLabelProductReader<TQueryResult extends PgQueryResultHKT>
  implements LabelProductReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async productsForLabels(productIds: readonly string[]): Promise<LabelProduct[]> {
    const ids = [...productIds];
    const productRows = await this.db
      .select({ id: products.id, name: products.name, active: products.active })
      .from(products)
      .where(inArray(products.id, ids));

    const barcodeRows = await this.db
      .select({ productId: productBarcodes.productId, code: productBarcodes.code })
      .from(productBarcodes)
      .where(inArray(productBarcodes.productId, ids))
      .orderBy(asc(productBarcodes.position));

    return productRows.map((row) => ({
      ...row,
      barcodes: barcodeRows
        .filter((barcode) => barcode.productId === row.id)
        .map((barcode) => barcode.code),
    }));
  }
}
