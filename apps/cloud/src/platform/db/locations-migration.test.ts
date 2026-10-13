import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("migrating a database that already has users", { timeout: 30_000 }, () => {
  it("backfills every existing user onto the seeded location", async () => {
    const database = await databaseBeforeMigration("_locations");
    await database.query(
      `insert into "users" ("first_name", "email") values ('Ada', 'ada@example.com')`,
    );

    const migrated = await database.applyMigration();

    const { rows: locationRows } = await migrated.query<{ id: string }>(
      `select "id" from "locations"`,
    );
    const { rows: userRows } = await migrated.query<{ location_id: string }>(
      `select "location_id" from "users"`,
    );
    expect(locationRows).toHaveLength(1);
    expect(userRows).toEqual([{ location_id: locationRows[0]?.id }]);
  });
});
