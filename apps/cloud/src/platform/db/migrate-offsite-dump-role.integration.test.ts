import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../migrate.js";
import { CLOUD_APP_PASSWORD } from "../../test-support/cloud-app-password.js";
import {
  createEmptyIntegrationDatabase,
  type IntegrationDatabase,
  withExclusiveMigration,
} from "../../test-support/integration-database.js";
import { MIGRATIONS_FOLDER } from "./migrations-folder.js";

// `offsite_dump` is one cluster-wide role, so every call to runMigrations below holds the
// exclusive migration lock, and the login it grants is used before the lock is released.
const OFFSITE_DUMP_PASSWORD = "offsite-dump-integration-test-password";
const PERMISSION_DENIED = "42501";

function asOffsiteDump(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.username = "offsite_dump";
  url.password = OFFSITE_DUMP_PASSWORD;
  return url.toString();
}

function migrate(database: IntegrationDatabase, offsiteDumpPassword?: string): Promise<void> {
  return runMigrations(database.adminDatabaseUrl, CLOUD_APP_PASSWORD, {
    migrationsFolder: MIGRATIONS_FOLDER,
    now: Date.now,
    ...(offsiteDumpPassword === undefined ? {} : { offsiteDumpPassword }),
  });
}

async function canLogin(database: IntegrationDatabase): Promise<boolean> {
  const admin = postgres(database.adminDatabaseUrl, { max: 1 });
  try {
    const [role] = await admin<{ canLogin: boolean }[]>`
      select rolcanlogin as "canLogin" from pg_roles where rolname = 'offsite_dump'
    `;
    return role?.canLogin ?? false;
  } finally {
    await admin.end({ timeout: 1 });
  }
}

describe("the offsite_dump role runMigrations creates", () => {
  let database: IntegrationDatabase;
  let offsiteDump: postgres.Sql;

  beforeAll(async () => {
    database = await createEmptyIntegrationDatabase("offsite_dump_role");
    await withExclusiveMigration(async () => {
      await migrate(database, OFFSITE_DUMP_PASSWORD);
      offsiteDump = postgres(asOffsiteDump(database.adminDatabaseUrl), { max: 1 });
      await offsiteDump`select 1`;
    });
  }, 60_000);

  afterAll(async () => {
    await offsiteDump.end({ timeout: 1 });
    await database.close();
  });

  it("logs in with the password runMigrations set", async () => {
    await expect(offsiteDump`select current_user as name`).resolves.toEqual([
      { name: "offsite_dump" },
    ]);
  });

  it("reads the business tables", async () => {
    await expect(offsiteDump`select count(*) from audit_log`).resolves.toHaveLength(1);
    await expect(offsiteDump`select id from products limit 1`).resolves.toBeDefined();
  });

  it("reads drizzle's migrations bookkeeping table", async () => {
    const rows = await offsiteDump<{ hash: string }[]>`select hash from drizzle.__drizzle_migrations`;
    expect(rows.length).toBeGreaterThan(0);
  });

  it("reads a table created after the role", async () => {
    const admin = postgres(database.adminDatabaseUrl, { max: 1 });
    try {
      await admin`create table offsite_dump_role_later_table (id int)`;
    } finally {
      await admin.end({ timeout: 1 });
    }

    await expect(offsiteDump`select id from offsite_dump_role_later_table`).resolves.toEqual([]);
  });

  it("cannot insert, update, delete or truncate a business table", async () => {
    for (const statement of [
      "insert into roles (name, is_administrator) values ('offsite_dump_role_test', false)",
      "update roles set name = 'rewritten'",
      "delete from roles",
      "truncate roles",
      "insert into audit_log (entity, entity_id) values ('offsite_dump_role_test', gen_random_uuid())",
    ]) {
      await expect(offsiteDump.unsafe(statement), statement).rejects.toMatchObject({
        code: PERMISSION_DENIED,
      });
    }
  });

  it("cannot create a table in the public schema", async () => {
    await expect(offsiteDump`create table offsite_dump_role_test_table (id int)`).rejects.toMatchObject(
      { code: PERMISSION_DENIED },
    );
  });

  it("cannot read graphile-worker's queue, which its row-level security keeps from every role but its owner", async () => {
    const rows = await offsiteDump`select * from graphile_worker.jobs`;
    expect(rows).toEqual([]);
  });

  it("cannot log in after migrations run again without the password", async () => {
    await withExclusiveMigration(() => migrate(database));

    expect(await canLogin(database)).toBe(false);
  }, 60_000);

  it("can log in again once the password is set", async () => {
    await withExclusiveMigration(async () => {
      await migrate(database, OFFSITE_DUMP_PASSWORD);
      expect(await canLogin(database)).toBe(true);
    });
  }, 60_000);
});
