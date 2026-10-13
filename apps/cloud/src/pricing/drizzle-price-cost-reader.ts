import type { PriceCostReader, ProductCostSource } from "@purosur/domain/pricing/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { lots, products, purchaseLines, purchases, stockMovements } from "../platform/db/schema.js";

export class DrizzlePriceCostReader<TQueryResult extends PgQueryResultHKT>
  implements PriceCostReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async costSourcesOf(
    locationId: string,
    productIds: readonly string[],
  ): Promise<ProductCostSource[]> {
    if (productIds.length === 0) {
      return [];
    }
    const purchased = await this.db
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
    const counted = await this.db
      .select({
        productId: lots.productId,
        countedAt: stockMovements.occurredAt,
        withdrawn: lots.withdrawn,
        costIncomplete: lots.costIncomplete,
        costTotalCents: lots.costTotalCents,
        costQuantity: lots.costQuantity,
      })
      .from(lots)
      .innerJoin(stockMovements, eq(stockMovements.id, lots.originMovementId))
      .where(and(eq(lots.locationId, locationId), inArray(lots.productId, [...productIds])));
    return [
      ...purchased.map((row) => ({
        productId: row.productId,
        source: {
          kind: "purchase_line" as const,
          lineId: row.lineId,
          purchasedOn: row.purchasedOn,
          recordedAt: row.recordedAt,
          cost: { totalCents: row.costPaidCents, quantity: row.quantityPerPackage },
        },
      })),
      ...counted.map((row) => ({
        productId: row.productId,
        source: {
          kind: "initial_count" as const,
          countedAt: row.countedAt,
          withdrawn: row.withdrawn,
          costIncomplete: row.costIncomplete,
          cost:
            row.costTotalCents === null || row.costQuantity === null
              ? null
              : { totalCents: row.costTotalCents, quantity: row.costQuantity },
        },
      })),
    ];
  }

  async isActiveProduct(productId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.active, true)));
    return found !== undefined;
  }
}
