import type { ReceiptType, SaleUnit } from "@purosur/domain";
import type {
  PurchaseLineListing,
  PurchaseListing,
  PurchasingListReader,
  Supplier,
} from "@purosur/domain/purchasing/use-cases";
import { asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import { brands, products, purchaseLines, purchases, suppliers } from "../platform/db/schema.js";

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
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        productSaleUnit: products.saleUnit,
        packages: purchaseLines.packages,
        quantity: purchaseLines.quantity,
        costPaidCents: purchaseLines.costPaidCents,
        quantityPerPackage: purchaseLines.quantityPerPackage,
        lotNumber: purchaseLines.lotNumber,
        expiresOn: purchaseLines.expiresOn,
      })
      .from(purchaseLines)
      .innerJoin(products, eq(products.id, purchaseLines.productId))
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
