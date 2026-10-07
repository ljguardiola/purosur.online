import type { ArcaVitalityStore, VitalityCheckRecord } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { arcaVitalityChecks } from "../platform/db/schema.js";

export class DrizzleArcaVitalityStore<TQueryResult extends PgQueryResultHKT>
  implements ArcaVitalityStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async recordVitalityCheck({ checkedAt, ok }: VitalityCheckRecord): Promise<void> {
    await this.db.insert(arcaVitalityChecks).values({ checkedAt, ok });
  }
}
