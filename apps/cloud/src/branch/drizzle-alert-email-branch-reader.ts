import type { AlertEmailBranchReader } from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { branchSettings } from "../platform/db/schema.js";

export class DrizzleAlertEmailBranchReader<TQueryResult extends PgQueryResultHKT>
  implements AlertEmailBranchReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async alertEmailBranchAddress(locationId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ address: branchSettings.address })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    return row?.address ?? null;
  }
}
