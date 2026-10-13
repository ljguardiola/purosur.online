import { describe, expect, it } from "vitest";
import {
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

async function insertLocation(client: SqlOnlyDatabase): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "insert into locations default values returning id",
  );
  const location = rows[0];
  if (!location) {
    throw new Error("test setup: seeding a location returned no row");
  }
  await client.query("insert into branch_settings (location_id) values ($1)", [location.id]);
  return location.id;
}

describe("the branch_hours migration's backfill of existing hours", {
  timeout: 30_000,
}, () => {
  it("splits weekday hours into Monday..Friday, keeps Saturday and Sunday as their own day, and skips closed groups", async () => {
    const database = await databaseBeforeMigration("_branch_hours");

    const { rows: seededLocationRows } = await database.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const seededLocation = seededLocationRows[0];
    if (!seededLocation) {
      throw new Error("test setup: no location seeded by the migrations run so far");
    }
    await database.query(
      `update branch_settings set
         weekday_opens_at = $1, weekday_closes_at = $2,
         saturday_opens_at = $3, saturday_closes_at = $4
       where location_id = $5`,
      ["09:00", "19:00", "09:00", "13:00", seededLocation.id],
    );
    const sundayOnlyLocationId = await insertLocation(database);
    await database.query(
      "update branch_settings set sunday_opens_at = $1, sunday_closes_at = $2 where location_id = $3",
      ["10:00", "14:00", sundayOnlyLocationId],
    );
    const closedLocationId = await insertLocation(database);

    const migrated = await database.applyMigration();

    const hoursOf = async (locationId: string) => {
      const { rows } = await migrated.query(
        `select day_of_week as "dayOfWeek", position, opens_at::text as "opensAt", closes_at::text as "closesAt"
           from branch_hours where location_id = $1 order by day_of_week asc`,
        [locationId],
      );
      return rows;
    };

    expect(await hoursOf(seededLocation.id)).toEqual([
      { dayOfWeek: 1, position: 0, opensAt: "09:00:00", closesAt: "19:00:00" },
      { dayOfWeek: 2, position: 0, opensAt: "09:00:00", closesAt: "19:00:00" },
      { dayOfWeek: 3, position: 0, opensAt: "09:00:00", closesAt: "19:00:00" },
      { dayOfWeek: 4, position: 0, opensAt: "09:00:00", closesAt: "19:00:00" },
      { dayOfWeek: 5, position: 0, opensAt: "09:00:00", closesAt: "19:00:00" },
      { dayOfWeek: 6, position: 0, opensAt: "09:00:00", closesAt: "13:00:00" },
    ]);
    expect(await hoursOf(sundayOnlyLocationId)).toEqual([
      { dayOfWeek: 7, position: 0, opensAt: "10:00:00", closesAt: "14:00:00" },
    ]);
    expect(await hoursOf(closedLocationId)).toEqual([]);
  });
});
