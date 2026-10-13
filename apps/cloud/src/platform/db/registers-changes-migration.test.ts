import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const OTHER_LOCATION = "00000000-0000-4000-8000-0000000000f1";
const REGISTER_A = "00000000-0000-4000-8000-0000000000c1";
const REGISTER_B = "00000000-0000-4000-8000-0000000000c2";

describe("the registers changes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("logs every existing register as an insert at version 1, so the register pulling from the start receives its own", async () => {
    const database = await databaseBeforeMigration("_registers_changes");

    const { rows: seededLocations } = await database.query<{ id: string }>(
      "select id from locations",
    );
    const seededLocation = seededLocations[0]?.id;
    await database.query("insert into locations (id) values ($1)", [OTHER_LOCATION]);
    await database.query(
      `insert into registers (id, location_id, name)
       values ($1, $3, 'Caja 2'), ($2, $4, 'Caja 1')`,
      [REGISTER_B, REGISTER_A, OTHER_LOCATION, seededLocation],
    );
    const { rows: before } = await database.query("select entity from changes");

    const migrated = await database.applyMigration();

    const { rows: logged } = await migrated.query(
      `select entity, entity_id, version, op, location_id, origin_device_id
       from changes order by change_seq offset $1`,
      [before.length],
    );
    const insert = { entity: "register", version: 1, op: "insert", location_id: null };
    expect(logged).toEqual([
      { ...insert, entity_id: REGISTER_A, origin_device_id: null },
      { ...insert, entity_id: REGISTER_B, origin_device_id: null },
    ]);
  });
});
