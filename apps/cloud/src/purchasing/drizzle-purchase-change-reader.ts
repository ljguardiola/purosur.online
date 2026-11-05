import type { SaleUnit } from "@purosur/domain";
import type {
  PurchaseChangeListing,
  PurchaseChangeProduct,
  PurchaseChangeReader,
} from "@purosur/domain/purchasing/use-cases";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { netContentRow } from "../catalog/net-content-row.js";
import {
  auditLog,
  brands,
  products,
  purchaseLines,
  purchases,
  users,
} from "../platform/db/schema.js";
import { changeOfAuditValues, PURCHASE_AUDIT_ENTITY } from "./purchase-audit-values.js";

export class DrizzlePurchaseChangeReader<TQueryResult extends PgQueryResultHKT>
  implements PurchaseChangeReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async purchaseChanges(
    locationId: string,
    purchaseId: string,
  ): Promise<PurchaseChangeListing[] | undefined> {
    const [purchase] = await this.db
      .select({ id: purchases.id })
      .from(purchases)
      .where(and(eq(purchases.id, purchaseId), eq(purchases.locationId, locationId)));
    if (!purchase) {
      return undefined;
    }
    const rows = await this.db
      .select({
        id: auditLog.id,
        actorId: auditLog.actorId,
        actorName: users.firstName,
        correctedAt: auditLog.at,
        previousValue: auditLog.previousValue,
        newValue: auditLog.newValue,
      })
      .from(auditLog)
      .innerJoin(users, eq(users.id, auditLog.actorId))
      .where(and(eq(auditLog.entity, PURCHASE_AUDIT_ENTITY), eq(auditLog.entityId, purchaseId)))
      .orderBy(desc(auditLog.at), desc(auditLog.id));
    return rows.map(({ previousValue, newValue, actorId, ...row }) => ({
      ...row,
      actorId: actorId as string,
      change: changeOfAuditValues(previousValue, newValue),
    }));
  }

  async productOfEachLine(purchaseId: string): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ id: purchaseLines.id, productId: purchaseLines.productId })
      .from(purchaseLines)
      .where(eq(purchaseLines.purchaseId, purchaseId));
    return new Map(rows.map(({ id, productId }) => [id, productId]));
  }

  async describedProducts(
    productIds: readonly string[],
  ): Promise<Map<string, PurchaseChangeProduct>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({
        id: products.id,
        name: products.name,
        brandName: brands.name,
        netContentQuantity: products.netContentQuantity,
        netContentUnit: products.netContentUnit,
        saleUnit: products.saleUnit,
      })
      .from(products)
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(inArray(products.id, [...productIds]));
    return new Map(
      rows.map(({ netContentQuantity, netContentUnit, saleUnit, ...product }) => [
        product.id,
        {
          ...product,
          netContent: netContentRow({ netContentQuantity, netContentUnit }),
          saleUnit: saleUnit as SaleUnit,
        },
      ]),
    );
  }
}
