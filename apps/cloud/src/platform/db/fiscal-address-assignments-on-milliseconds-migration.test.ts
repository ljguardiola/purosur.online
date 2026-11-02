import { describe, expect, it } from "vitest";
import {
  type DatabaseBeforeMigration,
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

const TAG_SUFFIX = "_fiscal_address_assignments_on_milliseconds";

async function databaseWithRegister(): Promise<DatabaseBeforeMigration> {
  const database = await databaseBeforeMigration(TAG_SUFFIX);
  await database.query(
    `insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1`,
  );
  await database.query(
    `insert into fiscal_addresses (name, street_address)
     values ('Deposito Central', 'Calle Ficticia 123'), ('Local Norte', 'Calle Ficticia 456')`,
  );
  return database;
}

async function assign(database: SqlOnlyDatabase, address: string, assignedAt: string) {
  await database.query(
    `insert into register_fiscal_address_assignments (register_id, fiscal_address_id, assigned_at)
     select r.id, f.id, $2::timestamptz from registers r, fiscal_addresses f
      where r.name = 'Caja 1' and f.name = $1`,
    [address, assignedAt],
  );
}

async function assignmentInstants(database: SqlOnlyDatabase) {
  const { rows } = await database.query<{ assignedAt: string }>(
    `select case when assigned_at = '-infinity' then '-infinity'
       else to_char(assigned_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end as "assignedAt"
       from register_fiscal_address_assignments order by assigned_at`,
  );
  return rows.map(({ assignedAt }) => assignedAt);
}

describe("the fiscal address assignments on milliseconds migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("moves a move recorded with microseconds to the start of its millisecond", async () => {
    const database = await databaseWithRegister();
    await assign(database, "Deposito Central", "-infinity");
    await assign(database, "Local Norte", "2026-09-15T15:00:00.000700Z");

    const migrated = await database.applyMigration();

    expect(await assignmentInstants(migrated)).toEqual([
      "-infinity",
      "2026-09-15T15:00:00.000000Z",
    ]);
  });

  it("keeps a move already recorded on a millisecond as it was", async () => {
    const database = await databaseWithRegister();
    await assign(database, "Deposito Central", "-infinity");
    await assign(database, "Local Norte", "2026-09-15T15:00:00.123000Z");

    const migrated = await database.applyMigration();

    expect(await assignmentInstants(migrated)).toEqual([
      "-infinity",
      "2026-09-15T15:00:00.123000Z",
    ]);
  });

  it("fails rather than merge two moves of one register within the same millisecond", async () => {
    const database = await databaseWithRegister();
    await assign(database, "Deposito Central", "2026-09-15T15:00:00.000200Z");
    await assign(database, "Local Norte", "2026-09-15T15:00:00.000700Z");

    await expect(database.applyMigration()).rejects.toThrow();
  });

  it("refuses afterwards a move recorded with microseconds", async () => {
    const database = await databaseWithRegister();

    const migrated = await database.applyMigration();

    await expect(assign(migrated, "Local Norte", "2026-10-01T10:00:00.000700Z")).rejects.toThrow(
      /register_fiscal_address_assignments_assigned_at_on_milliseconds/,
    );
    await assign(migrated, "Deposito Central", "-infinity");
    await assign(migrated, "Local Norte", "2026-10-01T10:00:00.123Z");
    expect(await assignmentInstants(migrated)).toEqual([
      "-infinity",
      "2026-10-01T10:00:00.123000Z",
    ]);
  });
});
