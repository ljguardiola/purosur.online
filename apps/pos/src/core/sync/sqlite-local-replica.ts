import type { BranchSettingsBody } from "@purosur/contracts";
import type { LocalReplica, PullPage } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { RegisterPulledChange } from "./pulled-change";

const DAY_FIELDS = [
  "monday_hours",
  "tuesday_hours",
  "wednesday_hours",
  "thursday_hours",
  "friday_hours",
  "saturday_hours",
  "sunday_hours",
] as const;

type WeeklyHours = Pick<BranchSettingsBody, (typeof DAY_FIELDS)[number]>;

interface BranchSettingsRecord {
  address: string;
  whatsapp_number: string;
  instagram_handle: string;
  weekly_hours: string;
  expiring_lot_alert_days: number;
  unreviewed_price_alert_days: number;
  good_condition_return_days: number;
  version: number;
}

function weeklyHoursOf(row: BranchSettingsBody): WeeklyHours {
  return Object.fromEntries(DAY_FIELDS.map((field) => [field, row[field]])) as WeeklyHours;
}

export class SqliteLocalReplica implements LocalReplica<RegisterPulledChange> {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  // A cursor only means something to the installation that pulled it: another one, perhaps of
  // another branch, starts over from the first change.
  adoptDevice(deviceId: string): void {
    this.database
      .prepare<[string, string]>(
        "UPDATE pull_cursor SET change_seq = 0, device_id = ? WHERE id = 1 AND device_id IS NOT ?",
      )
      .run(deviceId, deviceId);
  }

  async savedCursor(): Promise<number> {
    const row = this.database
      .prepare<[], { change_seq: number }>("SELECT change_seq FROM pull_cursor WHERE id = 1")
      .get();
    if (row === undefined) {
      throw new Error("the local database has no pull cursor");
    }
    return row.change_seq;
  }

  // A version the register already has, or an older one delivered late, never overwrites it.
  async savePage(page: PullPage<RegisterPulledChange>): Promise<void> {
    const saveBranchSettings = this.database.prepare(
      `INSERT INTO branch_settings (
         location_id, address, whatsapp_number, instagram_handle, weekly_hours,
         expiring_lot_alert_days, unreviewed_price_alert_days, good_condition_return_days, version
       ) VALUES (
         @location_id, @address, @whatsapp_number, @instagram_handle, @weekly_hours,
         @expiring_lot_alert_days, @unreviewed_price_alert_days, @good_condition_return_days,
         @version
       )
       ON CONFLICT (location_id) DO UPDATE SET
         address = excluded.address,
         whatsapp_number = excluded.whatsapp_number,
         instagram_handle = excluded.instagram_handle,
         weekly_hours = excluded.weekly_hours,
         expiring_lot_alert_days = excluded.expiring_lot_alert_days,
         unreviewed_price_alert_days = excluded.unreviewed_price_alert_days,
         good_condition_return_days = excluded.good_condition_return_days,
         version = excluded.version
       WHERE excluded.version > branch_settings.version`,
    );
    const saveCursor = this.database.prepare<[number]>(
      "UPDATE pull_cursor SET change_seq = ? WHERE id = 1",
    );

    this.database.transaction(() => {
      for (const { change } of page.changes) {
        const { row } = change;
        saveBranchSettings.run({
          location_id: change.entity_id,
          address: row.address,
          whatsapp_number: row.whatsapp_number,
          instagram_handle: row.instagram_handle,
          weekly_hours: JSON.stringify(weeklyHoursOf(row)),
          expiring_lot_alert_days: row.expiring_lot_alert_days,
          unreviewed_price_alert_days: row.unreviewed_price_alert_days,
          good_condition_return_days: row.good_condition_return_days,
          version: row.version,
        });
      }
      saveCursor.run(page.cursor);
    })();
  }

  branchSettings(locationId: string): BranchSettingsBody | undefined {
    const record = this.database
      .prepare<[string], BranchSettingsRecord>(
        `SELECT address, whatsapp_number, instagram_handle, weekly_hours, expiring_lot_alert_days,
                unreviewed_price_alert_days, good_condition_return_days, version
         FROM branch_settings WHERE location_id = ?`,
      )
      .get(locationId);
    if (record === undefined) {
      return undefined;
    }
    const { weekly_hours, ...fields } = record;
    return { ...fields, ...(JSON.parse(weekly_hours) as WeeklyHours) };
  }
}
