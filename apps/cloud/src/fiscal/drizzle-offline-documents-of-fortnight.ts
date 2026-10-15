import type { Fortnight, OfflineDocumentsOfFortnight } from "@purosur/domain/fiscal/use-cases";
import { and, count, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { offlineFiscalDocuments } from "../platform/db/schema.js";

export class DrizzleOfflineDocumentsOfFortnight<TQueryResult extends PgQueryResultHKT>
  implements OfflineDocumentsOfFortnight
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async countOn(pointOfSaleNumber: number, fortnight: Fortnight): Promise<number> {
    const [row] = await this.db
      .select({ documents: count() })
      .from(offlineFiscalDocuments)
      .where(
        and(
          eq(offlineFiscalDocuments.pointOfSale, pointOfSaleNumber),
          eq(offlineFiscalDocuments.fortnightStart, fortnight.start),
        ),
      );
    return row?.documents ?? 0;
  }
}
