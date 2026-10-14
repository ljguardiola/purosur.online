import type {
  BranchExpiryWindow,
  BranchExpiryWindowReader,
} from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { branchSettings } from "../platform/db/schema.js";

export class DrizzleBranchExpiryWindowReader<TQueryResult extends PgQueryResultHKT>
  implements BranchExpiryWindowReader
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
}
