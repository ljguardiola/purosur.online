import type {
  ProposalProduct,
  ProposalRow,
  SupplierItemLinkProposalReader,
} from "@purosur/domain/purchasing/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import { brands, productBarcodes, products, supplierPriceListRows } from "../platform/db/schema.js";

const PRODUCT_COLUMNS = {
  id: products.id,
  name: products.name,
  brandName: brands.name,
  netContentQuantity: products.netContentQuantity,
  netContentUnit: products.netContentUnit,
};

function proposalProduct(row: {
  id: string;
  name: string;
  brandName: string | null;
  netContentQuantity: number | null;
  netContentUnit: string | null;
}): ProposalProduct {
  return { id: row.id, name: row.name, brandName: row.brandName, netContent: netContentRow(row) };
}

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

  async activeProductsWithBarcode(barcode: string): Promise<ProposalProduct[]> {
    const rows = await this.db
      .selectDistinct({ ...PRODUCT_COLUMNS })
      .from(products)
      .innerJoin(productBarcodes, eq(productBarcodes.productId, products.id))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(
        and(
          eq(products.active, true),
          eq(productBarcodes.active, true),
          eq(productBarcodes.code, barcode),
        ),
      );
    return rows.map(proposalProduct);
  }

  async activeProducts(): Promise<ProposalProduct[]> {
    const rows = await this.db
      .select({ ...PRODUCT_COLUMNS })
      .from(products)
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(eq(products.active, true));
    return rows.map(proposalProduct);
  }
}
