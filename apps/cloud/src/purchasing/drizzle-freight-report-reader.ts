import type { RegisteredFreight } from "@purosur/domain";
import type { FreightReportQuery, FreightReportReader } from "@purosur/domain/purchasing/use-cases";
import { and, eq, gte, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { freights } from "../platform/db/schema.js";

export class DrizzleFreightReportReader<TQueryResult extends PgQueryResultHKT>
  implements FreightReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  registeredFreights({ locationId, range }: FreightReportQuery): Promise<RegisteredFreight[]> {
    return this.db
      .select({ freightOn: freights.freightOn, amountCents: freights.amountCents })
      .from(freights)
      .where(
        and(
          eq(freights.locationId, locationId),
          gte(freights.freightOn, range.from),
          lte(freights.freightOn, range.to),
        ),
      );
  }
}
