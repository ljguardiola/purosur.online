import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

async function migratedDatabaseWithARegister() {
  const database = await databaseBeforeMigration("_register_contingency");
  await database.query(
    "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1",
  );
  const migrated = await database.applyMigration();
  const { rows } = await migrated.query<{ id: string }>("select id from registers");
  const registerId = rows[0]?.id as string;
  return { migrated, registerId };
}

describe("the register contingency migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the registers it finds and starts with no interval and no reporting start", async () => {
    const { migrated } = await migratedDatabaseWithARegister();

    const registers = await migrated.query("select name from registers");
    const intervals = await migrated.query("select * from register_contingency_intervals");
    const reporting = await migrated.query("select * from register_contingency_reporting");

    expect(registers.rows).toEqual([{ name: "Caja 1" }]);
    expect(intervals.rows).toEqual([]);
    expect(reporting.rows).toEqual([]);
  });

  it("holds an interval that is still open and one that ended", async () => {
    const { migrated, registerId } = await migratedDatabaseWithARegister();

    await migrated.query(
      `insert into register_contingency_intervals (interval_id, register_id, started_at, ended_at)
       values (gen_random_uuid(), $1, '2026-10-06T11:00:00Z', null),
              (gen_random_uuid(), $1, '2026-10-06T09:00:00Z', '2026-10-06T09:40:00Z'),
              (gen_random_uuid(), $1, '2026-10-06T08:00:00Z', '2026-10-06T08:00:00Z')`,
      [registerId],
    );

    const { rows } = await migrated.query("select ended_at from register_contingency_intervals");
    expect(rows).toHaveLength(3);
  });

  it("refuses an interval that ends before it starts", async () => {
    const { migrated, registerId } = await migratedDatabaseWithARegister();

    await expect(
      migrated.query(
        `insert into register_contingency_intervals (interval_id, register_id, started_at, ended_at)
         values (gen_random_uuid(), $1, '2026-10-06T11:00:00Z', '2026-10-06T10:59:59Z')`,
        [registerId],
      ),
    ).rejects.toThrow(/check/i);
  });

  it("refuses an interval of a register that does not exist", async () => {
    const { migrated } = await migratedDatabaseWithARegister();

    await expect(
      migrated.query(
        `insert into register_contingency_intervals (interval_id, register_id, started_at)
         values (gen_random_uuid(), gen_random_uuid(), '2026-10-06T11:00:00Z')`,
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it("holds an interval id only once", async () => {
    const { migrated, registerId } = await migratedDatabaseWithARegister();
    const insert = () =>
      migrated.query(
        `insert into register_contingency_intervals (interval_id, register_id, started_at)
         values ('01a1414f-0002-7c2d-9e3f-5a6b7c8d9e02', $1, '2026-10-06T11:00:00Z')`,
        [registerId],
      );
    await insert();

    await expect(insert()).rejects.toThrow(/duplicate key/i);
  });

  it("holds one reporting start per register", async () => {
    const { migrated, registerId } = await migratedDatabaseWithARegister();
    const insert = () =>
      migrated.query(
        `insert into register_contingency_reporting (register_id, since)
         values ($1, '2026-10-06T11:00:00Z')`,
        [registerId],
      );
    await insert();

    await expect(insert()).rejects.toThrow(/duplicate key/i);
  });
});
