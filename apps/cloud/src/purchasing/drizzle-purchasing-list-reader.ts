import type { ReceiptType, SaleUnit } from "@purosur/domain";
import type {
  PackagingListing,
  PurchaseLineListing,
  PurchaseListing,
  PurchasingListReader,
  Supplier,
} from "@purosur/domain/purchasing/use-cases";
import { asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  productPackagings,
  products,
  purchaseLines,
  purchases,
  suppliers,
} from "../platform/db/schema.js";

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

  purchases(locationId: string): Promise<PurchaseListing[]> {
    return this.readPurchases(eq(purchases.locationId, locationId));
  }

  async purchase(purchaseId: string): Promise<PurchaseListing | undefined> {
    const [listing] = await this.readPurchases(eq(purchases.id, purchaseId));
    return listing;
  }

  private async readPurchases(where: SQL): Promise<PurchaseListing[]> {
    const purchaseRows = await this.db
      .select({
        id: purchases.id,
        purchasedOn: purchases.purchasedOn,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        receiptType: purchases.receiptType,
        receiptNumber: purchases.receiptNumber,
        note: purchases.note,
        recordedAt: purchases.recordedAt,
      })
      .from(purchases)
      .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .where(where)
      .orderBy(desc(purchases.recordedAt), desc(purchases.id));
    if (purchaseRows.length === 0) {
      return [];
    }

    const lineRows = await this.db
      .select({
        id: purchaseLines.id,
        purchaseId: purchaseLines.purchaseId,
        productId: products.id,
        productName: products.name,
        productSaleUnit: products.saleUnit,
        packagingId: productPackagings.id,
        packagingName: productPackagings.name,
        packages: purchaseLines.packages,
        quantity: purchaseLines.quantity,
        costPaidCents: purchaseLines.costPaidCents,
        quantityPerPackage: purchaseLines.quantityPerPackage,
        lotNumber: purchaseLines.lotNumber,
        expiresOn: purchaseLines.expiresOn,
      })
      .from(purchaseLines)
      .innerJoin(products, eq(products.id, purchaseLines.productId))
      .leftJoin(productPackagings, eq(productPackagings.id, purchaseLines.packagingId))
      .where(
        inArray(
          purchaseLines.purchaseId,
          purchaseRows.map((row) => row.id),
        ),
      )
      .orderBy(asc(products.name), asc(purchaseLines.id));
    const linesOf = new Map<string, PurchaseLineListing[]>();
    for (const { purchaseId, ...row } of lineRows) {
      const lines = linesOf.get(purchaseId) ?? [];
      lines.push({
        id: row.id,
        product: {
          id: row.productId,
          name: row.productName,
          saleUnit: row.productSaleUnit as SaleUnit,
        },
        packaging:
          row.packagingId === null || row.packagingName === null
            ? null
            : { id: row.packagingId, name: row.packagingName },
        packages: row.packages,
        quantity: row.quantity,
        costPaidCents: row.costPaidCents,
        quantityPerPackage: row.quantityPerPackage,
        lotNumber: row.lotNumber,
        expiresOn: row.expiresOn,
      });
      linesOf.set(purchaseId, lines);
    }

    return purchaseRows.map(({ supplierId, supplierName, receiptType, ...row }) => ({
      ...row,
      supplier: { id: supplierId, name: supplierName },
      receiptType: receiptType as ReceiptType,
      lines: linesOf.get(row.id) ?? [],
    }));
  }
}
