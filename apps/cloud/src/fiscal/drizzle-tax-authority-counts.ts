import type { LastAuthorizedCount, TaxAuthorityCounts } from "@purosur/domain/fiscal/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  registerOfflinePointsOfSale,
  taxAuthorityLastAuthorizedNumbers,
} from "../platform/db/schema.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";
import { notePointOfSaleHolderChanged } from "./note-point-of-sale-holder-changed.js";

export class DrizzleTaxAuthorityCounts<TQueryResult extends PgQueryResultHKT>
  implements TaxAuthorityCounts
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, pending?: PendingChanges) {
    this.db = db;
    this.pending = pending;
  }

  // The count travels with the point of sale of the register, real-time or offline, so the row
  // of the register that holds the number is logged as changed for it to pull it again.
  async advance({
    pointOfSale,
    lastAuthorized,
    issuedOn = null,
    readAt,
  }: LastAuthorizedCount): Promise<void> {
    await withPendingChanges(this.db, this.pending, async (tx, pending) => {
      await tx
        .insert(taxAuthorityLastAuthorizedNumbers)
        .values({ pointOfSaleNumber: pointOfSale, lastAuthorized, issuedOn, readAt })
        .onConflictDoUpdate({
          target: taxAuthorityLastAuthorizedNumbers.pointOfSaleNumber,
          set: {
            lastAuthorized: sql`greatest(${taxAuthorityLastAuthorizedNumbers.lastAuthorized}, excluded.last_authorized)`,
            issuedOn: sql`case
              when excluded.last_authorized > ${taxAuthorityLastAuthorizedNumbers.lastAuthorized} then excluded.issued_on
              when excluded.last_authorized = ${taxAuthorityLastAuthorizedNumbers.lastAuthorized} then coalesce(excluded.issued_on, ${taxAuthorityLastAuthorizedNumbers.issuedOn})
              else ${taxAuthorityLastAuthorizedNumbers.issuedOn}
            end`,
            readAt,
          },
        });
      await notePointOfSaleHolderChanged(tx, pending, pointOfSale);
      const [offlineHolder] = await tx
        .select({
          registerId: registerOfflinePointsOfSale.registerId,
          version: registerOfflinePointsOfSale.version,
        })
        .from(registerOfflinePointsOfSale)
        .where(eq(registerOfflinePointsOfSale.pointOfSaleNumber, pointOfSale));
      if (offlineHolder) {
        pending.note({
          entity: "register_offline_point_of_sale",
          entityId: offlineHolder.registerId,
          version: offlineHolder.version,
          op: "update",
        });
      }
    });
  }
}
