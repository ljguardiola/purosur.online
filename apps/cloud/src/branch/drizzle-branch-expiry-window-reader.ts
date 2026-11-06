import type {
  BranchExpiryWindow,
  BranchExpiryWindowReader,
} from "@purosur/domain/alerts/use-cases";
import type { ExpiryWarningWindowReader } from "@purosur/domain/stock/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { branchSettings } from "../platform/db/schema.js";

export class DrizzleBranchExpiryWindowReader<TQueryResult extends PgQueryResultHKT>
  implements BranchExpiryWindowReader, ExpiryWarningWindowReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  branchExpiryWindows(): Promise<BranchExpiryWindow[]> {
    return this.db
      .select({
        locationId: branchSettings.locationId,
        windowDays: branchSettings.expiringLotAlertDays,
      })
      .from(branchSettings);
  }

  async expiryWarningWindowDays(locationId: string): Promise<number> {
    const [row] = await this.db
      .select({ windowDays: branchSettings.expiringLotAlertDays })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    if (!row) {
      throw new Error(`branch settings missing for location ${locationId}`);
    }
    return row.windowDays;
  }
}
