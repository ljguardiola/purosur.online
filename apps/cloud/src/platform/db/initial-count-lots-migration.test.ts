import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

const MISSING_ID = "0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f";

async function initialCountLotsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_initial_count_lots",
    "test setup: no initial count lots migration in the journal",
  );
}

async function databaseHoldingLotsAndSessions() {
  const folder = await mkdtemp(join(tmpdir(), "initial-count-lots-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await initialCountLotsEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await client.query<{ id: string }>(sql, params);
    return rows[0]?.id as string;
  };
  const locationId = await first("select id from locations limit 1");
  const otherLocationId = await first(
    "insert into locations default values returning id",
  );
  const registerId = await first(
    "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
    [locationId],
  );
  const deviceId = await first(
    `insert into register_installations
       (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
     values ($1, 'prefix', 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
    [registerId],
  );
  for (const openedAt of ["2026-03-02T12:00:00Z", "2026-03-01T09:00:00Z"]) {
    await client.query(
      `insert into cash_sessions (id, location_id, register_id, device_id, opened_by, opened_at, opening_float)
       values (gen_random_uuid(), $1, $2, $3, 'user-1', $4, 0)`,
      [locationId, registerId, deviceId, openedAt],
    );
  }
  const categoryId = await first("insert into categories (name) values ('Almacen') returning id");
  const productId = await first(
    "insert into products (name, category_id, sale_unit) values ('Yerba', $1, 'UNIT') returning id",
    [categoryId],
  );
  const userId = await first(
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  await client.query(
    `insert into lots (product_id, location_id, quantity_received, technical, cost_incomplete)
     values ($1, $2, 0, true, true)`,
    [productId, locationId],
  );
  return { client, folder, locationId, otherLocationId, productId, userId };
}

async function migrated() {
  const database = await databaseHoldingLotsAndSessions();
  const { rows } = await database.client.query("select change_seq from changes");
  await addMigrationEntry(database.folder, await initialCountLotsEntry());
  await migrate(drizzle(database.client), { migrationsFolder: database.folder });
  return { ...database, changesBefore: rows.length };
}

describe("the initial count lots migration applied over a database that already holds lots and cash sessions", {
  timeout: 30_000,
}, () => {
  it("keeps the existing lot, not withdrawn and without an origin movement", async () => {
    const { client } = await migrated();

    const { rows } = await client.query(
      "select technical, withdrawn, origin_movement_id from lots",
    );

    expect(rows).toEqual([{ technical: true, withdrawn: false, origin_movement_id: null }]);
  });

  it("records the earliest opening of the branches that already sold, and logs it for the pull", async () => {
    const { client, locationId, changesBefore } = await migrated();

    const { rows: firstSessions } = await client.query(
      "select location_id, opened_at from branch_first_cash_sessions",
    );
    const { rows: logged } = await client.query(
      `select entity, entity_id, version, op from changes order by change_seq offset $1`,
      [changesBefore],
    );

    expect(firstSessions).toEqual([
      { location_id: locationId, opened_at: new Date("2026-03-01T09:00:00Z") },
    ]);
    expect(logged).toEqual([
      { entity: "branch_first_cash_session", entity_id: locationId, version: 1, op: "insert" },
    ]);
  });

  it("refuses the app role to change or remove a branch's first cash session", async () => {
    const { client } = await migrated();

    const { rows } = await client.query(
      `select has_table_privilege('cloud_app', 'branch_first_cash_sessions', 'UPDATE') as can_update,
              has_table_privilege('cloud_app', 'branch_first_cash_sessions', 'DELETE') as can_delete,
              has_table_privilege('cloud_app', 'branch_first_cash_sessions', 'INSERT') as can_insert`,
    );

    expect(rows).toEqual([{ can_update: false, can_delete: false, can_insert: true }]);
  });

  it("keeps a single first cash session per branch, of an existing branch", async () => {
    const { client, locationId, otherLocationId } = await migrated();
    const record = (location: string) =>
      client.query(
        "insert into branch_first_cash_sessions (location_id, opened_at) values ($1, now())",
        [location],
      );

    await record(otherLocationId);

    await expect(record(locationId)).rejects.toThrow(/branch_first_cash_sessions_pkey/);
    await expect(record(MISSING_ID)).rejects.toThrow(
      /branch_first_cash_sessions_location_id_locations_id_fk/,
    );
  });

  it("accepts an opening count and its withdrawal as movements with no reason, sale line or purchase line", async () => {
    const { client, locationId, productId, userId } = await migrated();
    const record = (kind: string, reason: string | null) =>
      client.query(
        `insert into stock_movements (product_id, location_id, kind, reason, delta, occurred_at, actor_id)
         values ($1, $2, $3, $4, 1000, now(), $5)`,
        [productId, locationId, kind, reason, userId],
      );

    await record("opening_count", null);
    await record("opening_count_withdrawal", null);

    await expect(record("opening_count", "other")).rejects.toThrow(
      /stock_movements_reason_unless_count_sale_or_receipt_check/,
    );
    await expect(record("opening_count_withdrawal", "other")).rejects.toThrow(
      /stock_movements_reason_unless_count_sale_or_receipt_check/,
    );
    await expect(record("initial", null)).rejects.toThrow(/stock_movements_kind_check/);
  });

  it("keeps a lot of the initial count to one movement of origin, with unknown cost, and withdrawn only when it is one", async () => {
    const { client, locationId, productId, userId } = await migrated();
    const movement = async () => {
      const { rows } = await client.query<{ id: string }>(
        `insert into stock_movements (product_id, location_id, kind, delta, occurred_at, actor_id)
         values ($1, $2, 'opening_count', 1000, now(), $3) returning id`,
        [productId, locationId, userId],
      );
      return (rows[0] as { id: string }).id;
    };
    const lot = (fields: { origin: string | null; technical?: boolean; withdrawn?: boolean }) =>
      client.query(
        `insert into lots (product_id, location_id, quantity_received, technical, cost_incomplete, origin_movement_id, withdrawn)
         values ($1, $2, 1000, $3, true, $4, $5)`,
        [
          productId,
          locationId,
          fields.technical ?? false,
          fields.origin,
          fields.withdrawn ?? false,
        ],
      );
    const originId = await movement();

    await lot({ origin: originId, withdrawn: true });

    await expect(lot({ origin: originId })).rejects.toThrow(/lots_origin_movement_id_key/);
    await expect(lot({ origin: MISSING_ID })).rejects.toThrow(
      /lots_origin_movement_id_stock_movements_id_fk/,
    );
    await expect(lot({ origin: null })).rejects.toThrow(/lots_exactly_one_origin_check/);
    await expect(lot({ origin: await movement(), technical: true })).rejects.toThrow(
      /lots_exactly_one_origin_check/,
    );
    await expect(lot({ origin: null, technical: true, withdrawn: true })).rejects.toThrow(
      /lots_withdrawn_only_if_initial_count_check/,
    );
  });
});
