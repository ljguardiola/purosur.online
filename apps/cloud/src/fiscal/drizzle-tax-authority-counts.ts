import type { LastAuthorizedCount, TaxAuthorityCounts } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerPointsOfSale, taxAuthorityLastAuthorizedNumbers } from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

export class DrizzleTaxAuthorityCounts<TQueryResult extends PgQueryResultHKT>
  implements TaxAuthorityCounts
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, pending?: PendingChanges) {
    this.db = db;
    this.pending = pending;
  }

  // The count travels with the register's point of sale, so the register's row is logged as
  // changed for the register to pull it again.
  async record({ pointOfSale, lastAuthorized, readAt }: LastAuthorizedCount): Promise<void> {
    await withPendingChanges(this.db, this.pending, async (tx, pending) => {
      await tx
        .insert(taxAuthorityLastAuthorizedNumbers)
        .values({ pointOfSaleNumber: pointOfSale, lastAuthorized, readAt })
        .onConflictDoUpdate({
          target: taxAuthorityLastAuthorizedNumbers.pointOfSaleNumber,
          set: { lastAuthorized, readAt },
        });
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
    });
  }
}
