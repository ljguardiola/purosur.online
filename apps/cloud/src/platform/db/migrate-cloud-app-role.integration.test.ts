import { randomUUID } from "node:crypto";
import { makeWorkerUtils } from "graphile-worker";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { runMigrations } from "../../migrate.js";
import { CLOUD_APP_PASSWORD } from "../../test-support/cloud-app-password.js";
import { withExclusiveMigration } from "../../test-support/integration-database.js";
import { MIGRATIONS_FOLDER } from "./migrations-folder.js";

// `cloud_app` is one cluster-wide role, so this suite reuses CLOUD_APP_PASSWORD; withExclusiveMigration
// keeps its runMigrations calls from racing another integration suite's own.
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
    // A role granting itself a privilege it doesn't own only warns, it doesn't error — nothing is
    // actually granted; the update failing afterward is what proves the attempt had no effect.
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

  async function insertPricedRow(): Promise<{ priceId: string; priceListId: string }> {
    const [category] = await cloudApp<{ id: string }[]>`
      insert into categories (name) values (${`cloud_app_role_test_${randomUUID()}`}) returning id
    `;
    const [priceList] = await cloudApp<{ id: string }[]>`select id from price_lists limit 1`;
    if (!category || !priceList) {
      throw new Error("test setup: seeding the category or price list returned no row");
    }
    const [product] = await cloudApp<{ id: string }[]>`
      insert into products (name, category_id, sale_unit)
      values ('cloud_app_role_test', ${category.id}, 'UNIT') returning id
    `;
    if (!product) {
      throw new Error("test setup: seeding the product returned no row");
    }
    const [price] = await cloudApp<{ id: string }[]>`
      insert into prices (product_id, price_list_id, unit_price)
      values (${product.id}, ${priceList.id}, 500) returning id
    `;
    if (!price) {
      throw new Error("test setup: seeding the price returned no row");
    }
    return { priceId: price.id, priceListId: priceList.id };
  }

  it("cannot update a prices row", async () => {
    const { priceId } = await insertPricedRow();
    await expectPermissionDenied(
      cloudApp`update prices set unit_price = 999 where id = ${priceId}`,
    );
  });

  it("cannot delete a prices row", async () => {
    const { priceId } = await insertPricedRow();
    await expectPermissionDenied(cloudApp`delete from prices where id = ${priceId}`);
  });

  it("cannot truncate prices", async () => {
    await expectPermissionDenied(cloudApp`truncate prices`);
  });

  it("cannot update or delete a price_reviews row", async () => {
    const { priceId, priceListId } = await insertPricedRow();
    const [product] = await cloudApp<{ productId: string }[]>`
      select product_id as "productId" from prices where id = ${priceId}
    `;
    const [location] = await cloudApp<{ id: string }[]>`select id from locations limit 1`;
    if (!product || !location) {
      throw new Error("test setup: reading the product or the seeded location returned no row");
    }
    const [user] = await cloudApp<{ id: string }[]>`
      insert into users (first_name, email, location_id)
      values ('Cloud App Role Test', ${`cloud-app-role-test-${randomUUID()}@example.com`}, ${location.id})
      returning id
    `;
    if (!user) {
      throw new Error("test setup: seeding the user returned no row");
    }
    const [review] = await cloudApp<{ id: string }[]>`
      insert into price_reviews (product_id, price_list_id, actor_id, price_id)
      values (${product.productId}, ${priceListId}, ${user.id}, ${priceId}) returning id
    `;
    if (!review) {
      throw new Error("test setup: seeding the price review returned no row");
    }

    await expectPermissionDenied(
      cloudApp`update price_reviews set price_id = ${priceId} where id = ${review.id}`,
    );
    await expectPermissionDenied(cloudApp`delete from price_reviews where id = ${review.id}`);
  });

  it("updates and deletes a row of a table whose write privileges are not revoked", async () => {
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

  // The previous deployment keeps serving as cloud_app while the next migrates; dropping and
  // recreating this policy would refuse it every graphile-worker row in between.
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

  it("leaves no connection open on the database once it resolves", async () => {
    const admin = postgres(adminUrl, { max: 1 });
    // Postgres refuses `CREATE DATABASE ... TEMPLATE` and blocks `DROP DATABASE` while anyone is
    // still connected, so a leaked connection here would make whatever runs next flaky.
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

  // graphile-worker checks its own schema on every start; runMigrations already applied it as
  // admin, so this never needs DDL privilege as cloud_app.
  it("starts graphile-worker as cloud_app without it needing any DDL privilege", async () => {
    const workerUtils = await makeWorkerUtils({ connectionString: cloudAppUrl });
    await workerUtils.release();
  });
});
