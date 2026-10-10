import type { SaleUnit } from "@purosur/domain";
import type {
  PackagingListing,
  PurchasingListReader,
  Supplier,
} from "@purosur/domain/purchasing/use-cases";
import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { productPackagings, products, suppliers } from "../platform/db/schema.js";

const packagingColumns = {
  id: productPackagings.id,
  productId: productPackagings.productId,
  productName: products.name,
  productSaleUnit: products.saleUnit,
  name: productPackagings.name,
  quantityPerPackage: productPackagings.quantityPerPackage,
  saleUnit: productPackagings.saleUnit,
  active: productPackagings.active,
  version: productPackagings.version,
};

function toListing(
  row: Omit<PackagingListing, "saleUnit" | "productSaleUnit"> & {
    saleUnit: string;
    productSaleUnit: string;
  },
): PackagingListing {
  return {
    ...row,
    saleUnit: row.saleUnit as SaleUnit,
    productSaleUnit: row.productSaleUnit as SaleUnit,
  };
}

export class DrizzlePurchasingListReader<TQueryResult extends PgQueryResultHKT>
  implements PurchasingListReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  suppliers(): Promise<Supplier[]> {
    return this.db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        cuit: suppliers.cuit,
        contact: suppliers.contact,
        note: suppliers.note,
        active: suppliers.active,
        version: suppliers.version,
      })
      .from(suppliers)
      .orderBy(asc(suppliers.name));
  }

  async packagings(): Promise<PackagingListing[]> {
    const rows = await this.db
      .select(packagingColumns)
      .from(productPackagings)
      .innerJoin(products, eq(products.id, productPackagings.productId))
      .orderBy(asc(productPackagings.name));
    return rows.map(toListing);
  }

  async packaging(packagingId: string): Promise<PackagingListing | undefined> {
    const [row] = await this.db
      .select(packagingColumns)
      .from(productPackagings)
      .innerJoin(products, eq(products.id, productPackagings.productId))
      .where(eq(productPackagings.id, packagingId));
    return row ? toListing(row) : undefined;
  }
}
