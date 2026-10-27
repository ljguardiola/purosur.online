import type {
  ProposalProduct,
  ProposalRow,
  SupplierItemLinkProposalReader,
} from "@purosur/domain/purchasing/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { productBarcodes, products, supplierPriceListRows } from "../platform/db/schema.js";

export class DrizzleSupplierItemLinkProposalReader<TQueryResult extends PgQueryResultHKT>
  implements SupplierItemLinkProposalReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async row(listId: string, rowId: string): Promise<ProposalRow | undefined> {
    const [row] = await this.db
      .select({
        description: supplierPriceListRows.description,
        presentation: supplierPriceListRows.presentation,
        barcode: supplierPriceListRows.barcode,
      })
      .from(supplierPriceListRows)
      .where(and(eq(supplierPriceListRows.id, rowId), eq(supplierPriceListRows.listId, listId)));
    return row;
  }

  activeProductsWithBarcode(barcode: string): Promise<ProposalProduct[]> {
    return this.db
      .selectDistinct({ id: products.id, name: products.name })
      .from(products)
      .innerJoin(productBarcodes, eq(productBarcodes.productId, products.id))
      .where(
        and(
          eq(products.active, true),
          eq(productBarcodes.active, true),
          eq(productBarcodes.code, barcode),
        ),
      );
  }

  activeProducts(): Promise<ProposalProduct[]> {
    return this.db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.active, true));
  }
}
