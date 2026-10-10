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

async function weighedSaleLinesEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_weighed_sale_lines",
    "test setup: no weighed sale lines migration in the journal",
  );
}

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "weighed-sale-lines-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await weighedSaleLinesEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await client.query<{ id: string }>(sql, params);
    return rows[0]?.id as string;
  };
  const locationId = await first("select id from locations limit 1");
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
  const sessionId = await first(
    `insert into cash_sessions (id, location_id, register_id, device_id, opened_by, opened_at, opening_float)
     values (gen_random_uuid(), $1, $2, $3, 'user-1', now(), 0) returning id`,
    [locationId, registerId, deviceId],
  );
  const categoryId = await first("insert into categories (name) values ('Almacen') returning id");
  const productId = await first(
    "insert into products (name, category_id, sale_unit) values ('Yerba', $1, 'UNIT') returning id",
    [categoryId],
  );
  const userId = await first(
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  const saleId = await first(
    `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'COMPLETED', now(), 2500, now()) returning id`,
    [locationId, registerId, deviceId, sessionId, userId],
  );
  const insertLine = (columns = "", values = "") =>
    client.query(
      `insert into sale_lines (id, sale_id, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total${columns})
       values (gen_random_uuid(), $1, $2, 'Yerba', 1250, 2500, gen_random_uuid(), 0, 3125${values})`,
      [saleId, productId],
    );
  return { client, folder, insertLine };
}

describe("the weighed sale lines migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded line, none of them with a weight source", async () => {
    const { client, folder, insertLine } = await databaseBefore();
    await insertLine();

    await addMigrationEntry(folder, await weighedSaleLinesEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query("select quantity, weight_source from sale_lines");
    expect(rows).toEqual([{ quantity: 1250, weight_source: null }]);
  });

  it.each(["SCALE", "MANUAL"])("records a line whose weight came from %s", async (source) => {
    const { client, folder, insertLine } = await databaseBefore();
    await addMigrationEntry(folder, await weighedSaleLinesEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    await insertLine(", weight_source", `, '${source}'`);

    const { rows } = await client.query("select weight_source from sale_lines");
    expect(rows).toEqual([{ weight_source: source }]);
  });

  it("refuses a weight source that is neither the scale nor a typed entry", async () => {
    const { client, folder, insertLine } = await databaseBefore();
    await addMigrationEntry(folder, await weighedSaleLinesEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    await expect(insertLine(", weight_source", ", 'SENSOR'")).rejects.toThrow(
      /sale_lines_weight_source_check/,
    );
  });
});
