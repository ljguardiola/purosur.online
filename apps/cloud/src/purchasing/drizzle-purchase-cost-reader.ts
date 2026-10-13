import type { PurchaseCostReader, PurchaseLineCost } from "@purosur/domain/pricing/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { purchaseLines, purchases } from "../platform/db/schema.js";

export class DrizzlePurchaseCostReader<TQueryResult extends PgQueryResultHKT>
  implements PurchaseCostReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async purchaseLineCostsOf(
    locationId: string,
    productIds: readonly string[],
  ): Promise<PurchaseLineCost[]> {
    if (productIds.length === 0) {
      return [];
    }
    const lines = await this.db
      .select({
        productId: purchaseLines.productId,
        lineId: purchaseLines.id,
        purchasedOn: purchases.purchasedOn,
        recordedAt: purchases.recordedAt,
        costPaidCents: purchaseLines.costPaidCents,
        quantityPerPackage: purchaseLines.quantityPerPackage,
      })
      .from(purchaseLines)
      .innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
      .where(
        and(
          eq(purchases.locationId, locationId),
          inArray(purchaseLines.productId, [...productIds]),
        ),
      );
    return lines.map(({ costPaidCents, quantityPerPackage, ...line }) => ({
      ...line,
      cost: { totalCents: costPaidCents, quantity: quantityPerPackage },
      freights: [],
    }));
  }
}
