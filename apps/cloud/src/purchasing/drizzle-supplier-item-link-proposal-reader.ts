import { SALE_UNITS } from "@purosur/domain";
import type {
  ProposalProduct,
  ProposalRow,
  SupplierItemLinkProposalReader,
} from "@purosur/domain/purchasing/use-cases";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import { brands, productBarcodes, products, supplierPriceListRows } from "../platform/db/schema.js";

const PRODUCT_COLUMNS = {
  id: products.id,
  name: products.name,
  brandName: brands.name,
  netContentQuantity: products.netContentQuantity,
  netContentUnit: products.netContentUnit,
  saleUnit: products.saleUnit,
};

function saleUnitOf(stored: string) {
  const saleUnit = SALE_UNITS.find((known) => known === stored);
  if (saleUnit === undefined) {
    throw new Error(`a product has no known sale unit: ${stored}`);
  }
  return saleUnit;
}

function proposalProduct(row: {
  id: string;
  name: string;
  brandName: string | null;
  netContentQuantity: number | null;
  netContentUnit: string | null;
  saleUnit: string;
}): ProposalProduct {
  return {
    id: row.id,
    name: row.name,
    brandName: row.brandName,
    netContent: netContentRow(row),
    saleUnit: saleUnitOf(row.saleUnit),
  };
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
    if (!row) {
      return undefined;
    }
    const siblings = await this.db
      .selectDistinct({ presentation: supplierPriceListRows.presentation })
      .from(supplierPriceListRows)
      .where(
        and(
          eq(supplierPriceListRows.listId, listId),
          eq(supplierPriceListRows.description, row.description),
          ne(supplierPriceListRows.id, rowId),
          isNotNull(supplierPriceListRows.presentation),
        ),
      )
      .orderBy(supplierPriceListRows.presentation);
    return {
      ...row,
      otherPresentations: siblings.flatMap(({ presentation }) =>
        presentation === null ? [] : [presentation],
      ),
    };
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
