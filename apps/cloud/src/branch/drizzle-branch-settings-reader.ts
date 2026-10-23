import { DEFAULT_SUPPLIER_PRICE_LIST_DAILY_EXTRACTION_CAP } from "@purosur/domain";
import type {
  BranchSettings,
  BranchSettingsReader,
  EditableBranchSettings,
} from "@purosur/domain/branch/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { branchSettings, supplierPriceListExtractionCaps } from "../platform/db/schema.js";
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

export async function readEditableBranchSettings<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<EditableBranchSettings> {
  const settings = await readBranchSettings(db, locationId);
  const [setCap] = await db
    .select({ dailyCap: supplierPriceListExtractionCaps.dailyCap })
    .from(supplierPriceListExtractionCaps)
    .where(eq(supplierPriceListExtractionCaps.locationId, locationId));
  return {
    ...settings,
    supplierPriceListDailyExtractionCap:
      setCap?.dailyCap ?? DEFAULT_SUPPLIER_PRICE_LIST_DAILY_EXTRACTION_CAP,
  };
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
  currentBranchSettings(locationId: string): Promise<EditableBranchSettings> {
    return this.db.transaction((tx) => readEditableBranchSettings(tx, locationId), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  }
}
