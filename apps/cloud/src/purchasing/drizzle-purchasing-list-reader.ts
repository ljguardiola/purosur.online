import type { SaleUnit } from "@purosur/domain";
import type { ProductActivityScope } from "@purosur/domain/catalog/use-cases";
import type {
  PackageableProduct,
  PackagingListing,
  PurchasingListReader,
  Supplier,
} from "@purosur/domain/purchasing/use-cases";
import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { productPackagings, products, suppliers } from "../platform/db/schema.js";

function productActivityCondition(scope: ProductActivityScope) {
  switch (scope) {
    case "active":
      return eq(products.active, true);
    case "inactive":
      return eq(products.active, false);
    case "any":
      return undefined;
  }
}

const packagingColumns = {
  id: productPackagings.id,
  productId: productPackagings.productId,
  productName: products.name,
  saleUnit: products.saleUnit,
  name: productPackagings.name,
  quantityPerPackage: productPackagings.quantityPerPackage,
  active: productPackagings.active,
  version: productPackagings.version,
};

function toListing(
  row: Omit<PackagingListing, "saleUnit"> & { saleUnit: string },
): PackagingListing {
  return { ...row, saleUnit: row.saleUnit as SaleUnit };
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

  async products(scope: ProductActivityScope): Promise<PackageableProduct[]> {
    const rows = await this.db
      .select({ id: products.id, name: products.name, saleUnit: products.saleUnit })
      .from(products)
      .where(productActivityCondition(scope))
      .orderBy(asc(products.name));
    return rows.map((row) => ({ ...row, saleUnit: row.saleUnit as SaleUnit }));
  }
}
