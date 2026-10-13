import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const DISCOUNT_A = "00000000-0000-4000-8000-0000000000d1";
const DISCOUNT_B = "00000000-0000-4000-8000-0000000000d2";

describe("the discounts changes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("logs every existing discount as an insert at its own version, so a register pulling from the start receives them", async () => {
    const database = await databaseBeforeMigration("_discounts_changes");

    const { rows: categoryRows } = await database.query<{ id: string }>(
      "insert into categories (name) values ('Almacén') returning id",
    );
    const category = categoryRows[0]?.id;
    await database.query(
      `insert into discounts (id, name, kind, percent, category_id, valid_from, valid_to, version, active)
       values ($1, 'Fin de semana', 'PERCENT_OFF', 20, $3, '2026-10-01', '2026-10-31', 4, false),
              ($2, 'Martes', 'PERCENT_OFF', 10, $3, '2026-10-01', '2026-10-31', 1, true)`,
      [DISCOUNT_B, DISCOUNT_A, category],
    );
    const { rows: before } = await database.query("select entity from changes");

    const migrated = await database.applyMigration();

    const { rows: logged } = await migrated.query(
      `select entity, entity_id, version, op, location_id, origin_device_id
       from changes order by change_seq offset $1`,
      [before.length],
    );
    const insert = { entity: "discount", op: "insert", location_id: null, origin_device_id: null };
    expect(logged).toEqual([
      { ...insert, entity_id: DISCOUNT_A, version: 1 },
      { ...insert, entity_id: DISCOUNT_B, version: 4 },
    ]);
  });
});
