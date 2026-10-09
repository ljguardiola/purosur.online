import type { BranchSettings, BranchSettingsReader } from "@purosur/domain/branch/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { branchSettings } from "../platform/db/schema.js";
import { readBranchHours } from "./drizzle-branch-hours-reader.js";

export async function readBranchSettings<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<BranchSettings> {
  const [row] = await db
    .select({
      address: branchSettings.address,
      whatsappNumber: branchSettings.whatsappNumber,
      instagramHandle: branchSettings.instagramHandle,
      expiringLotAlertDays: branchSettings.expiringLotAlertDays,
      unreviewedPriceAlertDays: branchSettings.unreviewedPriceAlertDays,
      goodConditionReturnDays: branchSettings.goodConditionReturnDays,
      version: branchSettings.version,
    })
    .from(branchSettings)
    .where(eq(branchSettings.locationId, locationId));
  if (!row) {
    // Every location gets this row from the migration that creates the table, so a missing one
    // is a broken invariant, not a legitimate case.
    throw new Error(`branch settings missing for location ${locationId}`);
  }
  return { ...row, hours: await readBranchHours(db, locationId) };
}

export class DrizzleBranchSettingsReader<TQueryResult extends PgQueryResultHKT>
  implements BranchSettingsReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  // Repeatable-read: both reads see one snapshot, so a save committing between them can't pair
  // settings from before it with hours from after it.
  currentBranchSettings(locationId: string): Promise<BranchSettings> {
    return this.db.transaction((tx) => readBranchSettings(tx, locationId), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  }
}
