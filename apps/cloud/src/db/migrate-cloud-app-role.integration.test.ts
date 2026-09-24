import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { runMigrations } from "../migrate.js";

// Proves the real production wiring `runMigrations` sets up against a real Postgres: the
// `cloud_app` role its migration creates can insert and read `audit_log`, but the database
// itself refuses every attempt to rewrite or erase a row already written there, even one that
// tries to grant itself that power back. PGlite's own tests cover that the migration SQL applies
// cleanly; this suite covers what the role can and cannot do against a real Postgres.
const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;
const CLOUD_APP_PASSWORD = "cloud-app-role-integration-test-password";
const PERMISSION_DENIED = "42501";

function databaseUrlFor(adminUrl: string, databaseName: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function asCloudApp(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.username = "cloud_app";
  url.password = CLOUD_APP_PASSWORD;
  return url.toString();
}

async function expectPermissionDenied(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code: PERMISSION_DENIED });
}

describe("the cloud_app role runMigrations creates", () => {
  let adminUrl: string;
  let databaseName: string;
  let cloudApp: postgres.Sql;

  beforeAll(async () => {
    adminUrl = inject("recoveryPostgresAdminUrl");
    databaseName = `cloud_app_role_${randomUUID().replaceAll("-", "")}`;

    const admin = postgres(adminUrl, { max: 1 });
    try {
      await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
    } finally {
      await admin.end({ timeout: 1 });
    }

    const databaseUrl = databaseUrlFor(adminUrl, databaseName);
    await runMigrations(databaseUrl, CLOUD_APP_PASSWORD, { migrationsFolder: MIGRATIONS_FOLDER });

    cloudApp = postgres(asCloudApp(databaseUrl), { max: 1 });
  }, 60_000);

  afterAll(async () => {
    await cloudApp.end({ timeout: 1 });
    const cleanup = postgres(adminUrl, { max: 1 });
    try {
      await cleanup.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await cleanup.end({ timeout: 1 });
    }
  });

  it("logs in with the password runMigrations set", async () => {
    await expect(cloudApp`select 1 as one`).resolves.toEqual([{ one: 1 }]);
  });

  it("inserts and reads its own audit_log rows", async () => {
    const entityId = randomUUID();
    await cloudApp`insert into audit_log (entity, entity_id) values ('cloud_app_role_test', ${entityId})`;

    const rows = await cloudApp<{ entity: string }[]>`
      select entity from audit_log where entity_id = ${entityId}
    `;
    expect(rows).toEqual([{ entity: "cloud_app_role_test" }]);
  });

  it("cannot update an audit_log row", async () => {
    const entityId = randomUUID();
    await cloudApp`insert into audit_log (entity, entity_id) values ('cloud_app_role_test', ${entityId})`;

    await expectPermissionDenied(
      cloudApp`update audit_log set entity = 'rewritten' where entity_id = ${entityId}`,
    );
  });

  it("cannot delete an audit_log row", async () => {
    const entityId = randomUUID();
    await cloudApp`insert into audit_log (entity, entity_id) values ('cloud_app_role_test', ${entityId})`;

    await expectPermissionDenied(cloudApp`delete from audit_log where entity_id = ${entityId}`);
  });

  it("cannot truncate audit_log", async () => {
    await expectPermissionDenied(cloudApp`truncate audit_log`);
  });

  it("cannot grant itself update back on audit_log", async () => {
    // Postgres answers a role's own no-op GRANT attempt with a warning, not an error: it is not
    // the owner of audit_log and holds no grant option on it, so nothing is actually granted.
    // What proves the attempt failed is that the update it tried to unlock is still rejected.
    await cloudApp`grant update on audit_log to cloud_app`;

    const entityId = randomUUID();
    await cloudApp`insert into audit_log (entity, entity_id) values ('cloud_app_role_test', ${entityId})`;
    await expectPermissionDenied(
      cloudApp`update audit_log set entity = 'rewritten' where entity_id = ${entityId}`,
    );
  });

  it("cannot alter audit_log", async () => {
    await expectPermissionDenied(cloudApp`alter table audit_log add column extra text`);
  });

  // The control: proves the rejections above come from audit_log's own revoked privileges, not
  // from cloud_app being unable to write at all.
  it("still updates and deletes an ordinary table's row", async () => {
    const [role] = await cloudApp<{ id: string }[]>`
      insert into roles (name, is_administrator) values ('cloud_app_role_test', false) returning id
    `;
    if (!role) {
      throw new Error("test setup: inserting the test role returned no row");
    }

    await cloudApp`update roles set name = 'cloud_app_role_test_renamed' where id = ${role.id}`;
    await cloudApp`delete from roles where id = ${role.id}`;

    const remaining = await cloudApp<{ id: string }[]>`select id from roles where id = ${role.id}`;
    expect(remaining).toEqual([]);
  });

  it("cannot create a table in the public schema", async () => {
    await expectPermissionDenied(cloudApp`create table cloud_app_role_test_table (id int)`);
  });

  it("reads drizzle's own migrations bookkeeping table", async () => {
    const rows = await cloudApp<{ hash: string }[]>`select hash from drizzle.__drizzle_migrations`;
    expect(rows.length).toBeGreaterThan(0);
  });
});
