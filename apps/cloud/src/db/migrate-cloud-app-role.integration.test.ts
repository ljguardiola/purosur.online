import { randomUUID } from "node:crypto";
import { makeWorkerUtils } from "graphile-worker";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { runMigrations } from "../migrate.js";
import { withExclusiveMigration } from "../recovery/recovery-integration-database.js";
import { CLOUD_APP_PASSWORD } from "./cloud-app-password.js";

// Proves the real production wiring `runMigrations` sets up against a real Postgres: the
// `cloud_app` role its migration creates can insert and read `audit_log`, but the database
// itself refuses every attempt to rewrite or erase a row already written there, even one that
// tries to grant itself that power back. PGlite's own tests cover that the migration SQL applies
// cleanly; this suite covers what the role can and cannot do against a real Postgres.
//
// `cloud_app` is one cluster-wide role, so this suite's own migrations set the same password the
// global setup set migrating the template database (`CLOUD_APP_PASSWORD`).
// `withExclusiveMigration` keeps this suite's direct `runMigrations` calls from racing
// `wait-for-ready.integration.test.ts`'s own.
const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;
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
  let cloudAppUrl: string;
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
    await withExclusiveMigration(() =>
      runMigrations(databaseUrl, CLOUD_APP_PASSWORD, { migrationsFolder: MIGRATIONS_FOLDER }),
    );

    cloudAppUrl = asCloudApp(databaseUrl);
    cloudApp = postgres(cloudAppUrl, { max: 1 });
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

  it("writes a table created by a later migration", async () => {
    const [role] = await cloudApp<{ id: string }[]>`
      insert into roles (name, is_administrator) values ('cloud_app_role_permissions_test', false)
      returning id
    `;
    if (!role) {
      throw new Error("test setup: inserting the test role returned no row");
    }

    await cloudApp`
      insert into role_permissions (role_id, permission_key) values (${role.id}, 'view_reports')
    `;
    await cloudApp`delete from role_permissions where role_id = ${role.id}`;
    await cloudApp`delete from roles where id = ${role.id}`;

    const remaining = await cloudApp<{ roleId: string }[]>`
      select role_id from role_permissions where role_id = ${role.id}
    `;
    expect(remaining).toEqual([]);
  });

  it("cannot create a table in the public schema", async () => {
    await expectPermissionDenied(cloudApp`create table cloud_app_role_test_table (id int)`);
  });

  it("reads drizzle's own migrations bookkeeping table", async () => {
    const rows = await cloudApp<{ hash: string }[]>`select hash from drizzle.__drizzle_migrations`;
    expect(rows.length).toBeGreaterThan(0);
  });

  // The previous deployment keeps serving as cloud_app while the next deploy migrates, so a
  // policy dropped and re-created would leave it refused every graphile-worker row in between.
  it("keeps its graphile-worker row-security policies in place when migrations run again", async () => {
    const admin = postgres(databaseUrlFor(adminUrl, databaseName), { max: 1 });
    try {
      const policyIds = () =>
        admin<{ oid: number }[]>`
          select p.oid::int as oid from pg_policy p
          join pg_class c on c.oid = p.polrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'graphile_worker' and p.polname = 'cloud_app_full_access'
          order by p.oid
        `;
      const before = await policyIds();

      await withExclusiveMigration(() =>
        runMigrations(databaseUrlFor(adminUrl, databaseName), CLOUD_APP_PASSWORD, {
          migrationsFolder: MIGRATIONS_FOLDER,
        }),
      );

      expect(before.length).toBeGreaterThan(0);
      expect(await policyIds()).toEqual(before);
    } finally {
      await admin.end({ timeout: 1 });
    }
  }, 60_000);

  // Postgres refuses `CREATE DATABASE ... TEMPLATE` and waits on `DROP DATABASE` while anyone is
  // still connected to that database, so a connection runMigrations leaves closing behind it
  // makes whatever runs next on that database depend on how fast the backend happens to exit.
  it("leaves no connection open on the database once it resolves", async () => {
    const admin = postgres(adminUrl, { max: 1 });
    try {
      await withExclusiveMigration(async () => {
        await runMigrations(databaseUrlFor(adminUrl, databaseName), CLOUD_APP_PASSWORD, {
          migrationsFolder: MIGRATIONS_FOLDER,
        });
        const backends = await admin<{ pid: number }[]>`
          select pid from pg_stat_activity
          where datname = ${databaseName} and usename = current_user
        `;
        expect(backends).toEqual([]);
      });
    } finally {
      await admin.end({ timeout: 1 });
    }
  }, 60_000);

  // graphile-worker checks its own schema is current every time it starts (`makeWorkerUtils`,
  // `run()`), which `server.ts` does as `cloud_app` at runtime. `runMigrations` already applied
  // graphile-worker's migrations as the admin role above, so this check finds nothing left to
  // install and never needs to run any DDL as `cloud_app` (which it has no privilege for).
  it("starts graphile-worker as cloud_app without it needing any DDL privilege", async () => {
    const workerUtils = await makeWorkerUtils({ connectionString: cloudAppUrl });
    await workerUtils.release();
  });
});
