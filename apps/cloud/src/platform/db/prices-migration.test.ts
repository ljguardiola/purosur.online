import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the prices migration applied to a database that already holds branch settings", {
  timeout: 30_000,
}, () => {
  it("points every existing branch at the one price list it creates", async () => {
    const database = await databaseBeforeMigration("_prices_and_price_reviews");

    const { rows: secondLocationRows } = await database.query<{ id: string }>(
      "insert into locations default values returning id",
    );
    const secondLocation = secondLocationRows[0];
    if (!secondLocation) {
      throw new Error("test setup: seeding the second location returned no row");
    }
    await database.query("insert into branch_settings (location_id) values ($1)", [
      secondLocation.id,
    ]);
    const { rows: locationRows } = await database.query<{ id: string }>("select id from locations");
    expect(locationRows).toHaveLength(2);

    const migrated = await database.applyMigration();

    const { rows: priceListRows } = await migrated.query<{ id: string; name: string }>(
      "select id, name from price_lists",
    );
    expect(priceListRows).toEqual([{ id: expect.any(String), name: "Lista general" }]);
    const generalListId = priceListRows[0]?.id;

    const { rows: settingsRows } = await migrated.query<{
      location_id: string;
      price_list_id: string;
    }>("select location_id, price_list_id from branch_settings");
    expect(settingsRows).toHaveLength(2);
    expect(settingsRows.map((row) => row.price_list_id)).toEqual([generalListId, generalListId]);
    expect(settingsRows.map((row) => row.location_id).sort()).toEqual(
      locationRows.map((row) => row.id).sort(),
    );
  });
});
