import {
  compareCodeUnits,
  compareSpanishText,
  type ReceiptType,
  type SaleUnit,
} from "@purosur/domain";
import type {
  PurchaseLineListing,
  PurchaseListing,
  PurchasingListReader,
  Supplier,
} from "@purosur/domain/purchasing/use-cases";
import type { LotNameFacts } from "@purosur/domain/stock/use-cases";
import { asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import {
  brands,
  lots,
  products,
  purchaseLines,
  purchases,
  suppliers,
} from "../platform/db/schema.js";
import { DrizzleLotNameReader } from "../stock/drizzle-lot-name-reader.js";

export class DrizzlePurchasingListReader<TQueryResult extends PgQueryResultHKT>
  implements PurchasingListReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async suppliers(): Promise<Supplier[]> {
    const rows = await this.db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        cuit: suppliers.cuit,
        contact: suppliers.contact,
        note: suppliers.note,
        active: suppliers.active,
        version: suppliers.version,
      })
      .from(suppliers);
    return rows.sort((a, b) => compareSpanishText(a.name, b.name) || compareCodeUnits(a.id, b.id));
  }

  lotNameFacts(locationId: string, productIds: readonly string[]): Promise<LotNameFacts[]> {
    return new DrizzleLotNameReader(this.db).lotNameFacts(locationId, productIds);
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
        locationId: purchases.locationId,
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
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        productSaleUnit: products.saleUnit,
        packages: purchaseLines.packages,
        quantity: purchaseLines.quantity,
        costPaidCents: purchaseLines.costPaidCents,
        quantityPerPackage: purchaseLines.quantityPerPackage,
        lotId: lots.id,
        expiresOn: purchaseLines.expiresOn,
      })
      .from(purchaseLines)
      .innerJoin(products, eq(products.id, purchaseLines.productId))
      .innerJoin(lots, eq(lots.purchaseLineId, purchaseLines.id))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(
        inArray(
          purchaseLines.purchaseId,
          purchaseRows.map((row) => row.id),
        ),
      )
      .orderBy(asc(purchaseLines.position));
    const linesOf = new Map<string, PurchaseLineListing[]>();
    for (const { purchaseId, ...row } of lineRows) {
      const lines = linesOf.get(purchaseId) ?? [];
      lines.push({
        id: row.id,
        product: {
          id: row.productId,
          name: row.productName,
          brandName: row.brandName,
          netContent: netContentRow({
            netContentQuantity: row.netContentQuantity,
            netContentUnit: row.netContentUnit,
          }),
          saleUnit: row.productSaleUnit as SaleUnit,
        },
        packages: row.packages,
        quantity: row.quantity,
        costPaidCents: row.costPaidCents,
        quantityPerPackage: row.quantityPerPackage,
        lotId: row.lotId,
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
