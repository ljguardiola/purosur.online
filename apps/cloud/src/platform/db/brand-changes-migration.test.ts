import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const BRAND_A = "00000000-0000-4000-8000-0000000000a1";
const BRAND_B = "00000000-0000-4000-8000-0000000000a2";

describe("the brand changes migration applied over a database that already holds brands", {
  timeout: 30_000,
}, () => {
  it("logs every existing brand once as an insert at its version, so a register pulling from the start receives it", async () => {
    const database = await databaseBeforeMigration("_brand_changes");
    await database.query(
      "insert into brands (id, name, active, version) values ($1, 'Vitora', false, 3), ($2, 'Granuz', true, 1)",
      [BRAND_B, BRAND_A],
    );
    const { rows: before } = await database.query("select entity from changes");

    const migrated = await database.applyMigration();

    const { rows: logged } = await migrated.query(
      `select entity, entity_id, version, op, price_list_id, origin_device_id
       from changes order by change_seq offset $1`,
      [before.length],
    );
    const insert = { entity: "brand", op: "insert", price_list_id: null, origin_device_id: null };
    expect(logged).toEqual([
      { ...insert, entity_id: BRAND_A, version: 1 },
      { ...insert, entity_id: BRAND_B, version: 3 },
    ]);
  });
});
