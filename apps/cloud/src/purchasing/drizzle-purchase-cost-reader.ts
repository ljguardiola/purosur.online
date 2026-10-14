import type { PurchaseCostReader, PurchaseLineCost } from "@purosur/domain/pricing/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { freightPurchases, freights, purchaseLines, purchases } from "../platform/db/schema.js";

type FreightToDistribute = PurchaseLineCost["freights"][number];
type FreightLine = FreightToDistribute["lines"][number];

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
        purchaseId: purchaseLines.purchaseId,
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
    const freightsOf = await this.freightsCovering(
      locationId,
      lines.map(({ purchaseId }) => purchaseId),
    );
    return lines.map(({ costPaidCents, quantityPerPackage, purchaseId, ...line }) => ({
      ...line,
      cost: { totalCents: costPaidCents, quantity: quantityPerPackage },
      freights: freightsOf.get(purchaseId) ?? [],
    }));
  }

  private async freightsCovering(
    locationId: string,
    purchaseIds: readonly string[],
  ): Promise<Map<string, FreightToDistribute[]>> {
    const covering = await this.db
      .select({
        purchaseId: freightPurchases.purchaseId,
        freightId: freights.id,
        amountCents: freights.amountCents,
      })
      .from(freightPurchases)
      .innerJoin(freights, eq(freights.id, freightPurchases.freightId))
      .where(
        and(
          eq(freights.locationId, locationId),
          inArray(freightPurchases.purchaseId, [...new Set(purchaseIds)]),
        ),
      );
    if (covering.length === 0) {
      return new Map();
    }

    const distributed = await this.db
      .select({
        freightId: freightPurchases.freightId,
        id: purchaseLines.id,
        costPaidCents: purchaseLines.costPaidCents,
        quantity: purchaseLines.quantity,
        quantityPerPackage: purchaseLines.quantityPerPackage,
      })
      .from(freightPurchases)
      .innerJoin(purchaseLines, eq(purchaseLines.purchaseId, freightPurchases.purchaseId))
      .where(
        inArray(freightPurchases.freightId, [
          ...new Set(covering.map(({ freightId }) => freightId)),
        ]),
      );
    const linesOf = new Map<string, FreightLine[]>();
    for (const { freightId, ...line } of distributed) {
      linesOf.set(freightId, [...(linesOf.get(freightId) ?? []), line]);
    }

    const freightsOf = new Map<string, FreightToDistribute[]>();
    for (const { purchaseId, freightId, amountCents } of covering) {
      freightsOf.set(purchaseId, [
        ...(freightsOf.get(purchaseId) ?? []),
        { amountCents, lines: linesOf.get(freightId) ?? [] },
      ]);
    }
    return freightsOf;
  }
}
