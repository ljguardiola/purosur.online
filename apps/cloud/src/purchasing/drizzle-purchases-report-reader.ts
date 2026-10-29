import type {
  PurchasesReportQuery,
  PurchasesReportReader,
} from "@purosur/domain/purchasing/use-cases";
import { and, eq, gte, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { purchaseLines, purchases, suppliers } from "../platform/db/schema.js";

export class DrizzlePurchasesReportReader<TQueryResult extends PgQueryResultHKT>
  implements PurchasesReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  purchasedLines({
    locationId,
    range,
  }: PurchasesReportQuery): ReturnType<PurchasesReportReader["purchasedLines"]> {
    return this.db
      .select({
        purchaseId: purchases.id,
        supplierId: purchases.supplierId,
        supplierName: suppliers.name,
        purchasedOn: purchases.purchasedOn,
        costPaidCents: purchaseLines.costPaidCents,
        quantity: purchaseLines.quantity,
        quantityPerPackage: purchaseLines.quantityPerPackage,
      })
      .from(purchaseLines)
      .innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
      .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .where(
        and(
          eq(purchases.locationId, locationId),
          gte(purchases.purchasedOn, range.from),
          lte(purchases.purchasedOn, range.to),
        ),
      );
  }
}
