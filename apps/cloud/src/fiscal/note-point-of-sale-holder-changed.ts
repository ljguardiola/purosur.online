import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerPointsOfSale } from "../platform/db/schema.js";
import type { PendingChanges } from "../sync/change-log.js";

export async function notePointOfSaleHolderChanged<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  pending: PendingChanges,
  pointOfSale: number,
): Promise<void> {
  const [holder] = await tx
    .select({
      registerId: registerPointsOfSale.registerId,
      version: registerPointsOfSale.version,
    })
    .from(registerPointsOfSale)
    .where(eq(registerPointsOfSale.pointOfSaleNumber, pointOfSale));
  if (holder) {
    pending.note({
      entity: "register_point_of_sale",
      entityId: holder.registerId,
      version: holder.version,
      op: "update",
    });
  }
}
