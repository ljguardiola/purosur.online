import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

describe("the remove register help grants migration", { timeout: 30_000 }, () => {
  it("removes only the grant to read the register's help from the roles that held it", async () => {
    const database = await databaseBeforeMigration("_remove_register_help_grants");
    const { rows: roles } = await database.query<{ id: string }>(
      "insert into roles (name) values ('Cajera') returning id",
    );
    const roleId = roles[0]?.id;
    await database.query(
      `insert into role_permissions (role_id, permission_key)
       values ($1, 'read_register_help'), ($1, 'sell_and_charge')`,
      [roleId],
    );
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query<{ permission_key: string }>(
      "select permission_key from role_permissions where role_id = $1",
      [roleId],
    );

    expect(rows).toEqual([{ permission_key: "sell_and_charge" }]);
  });
});
