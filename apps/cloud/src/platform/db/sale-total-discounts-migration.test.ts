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

async function saleTotalDiscountsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_sale_total_discounts",
    "test setup: no sale total discounts migration in the journal",
  );
}

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "sale-total-discounts-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await saleTotalDiscountsEntry());
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
  const insertSale = (columns = "", values = "") =>
    first(
      `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, total, applied_at${columns})
       values (gen_random_uuid(), $1, $2, $3, $4, $5, 'COMPLETED', now(), 2500, now()${values}) returning id`,
      [locationId, registerId, deviceId, sessionId, userId],
    );
  const insertLine = (saleId: string, columns = "", values = "") =>
    client.query(
      `insert into sale_lines (id, sale_id, product_id, product_name, quantity, list_unit_price, price_list_id, discount_amount, line_total${columns})
       values (gen_random_uuid(), $1, $2, 'Yerba', 1, 2500, gen_random_uuid(), 0, 2500${values})`,
      [saleId, productId],
    );
  const migrated = async () => {
    await addMigrationEntry(folder, await saleTotalDiscountsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });
  };
  return { client, insertSale, insertLine, migrated };
}

const DISCOUNT_COLUMNS =
  ", sale_discount_kind, sale_discount_value, sale_discount_amount, sale_discount_reason, sale_discount_authorized_by";

describe("the sale total discounts migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded sale, none of them discounted, and every line sharing nothing", async () => {
    const { client, insertSale, insertLine, migrated } = await databaseBefore();
    await insertLine(await insertSale());

    await migrated();

    const sales = await client.query(`select total${DISCOUNT_COLUMNS} from sales`);
    expect(sales.rows).toEqual([
      {
        total: 2500,
        sale_discount_kind: null,
        sale_discount_value: null,
        sale_discount_amount: null,
        sale_discount_reason: null,
        sale_discount_authorized_by: null,
      },
    ]);
    const lines = await client.query("select line_total, sale_discount_share from sale_lines");
    expect(lines.rows).toEqual([{ line_total: 2500, sale_discount_share: 0 }]);
  });

  it.each([
    ["PERCENT", 1, 25, null],
    ["PERCENT", 100, 2500, "supervisor"],
    ["AMOUNT", 300, 300, null],
    ["AMOUNT", 300, 0, "supervisor"],
  ])(
    "records a sale discounted with a %s of %i that takes %i off, authorized by %s",
    async (kind, value, amount, authorizer) => {
      const { client, insertSale, migrated } = await databaseBefore();
      await migrated();

      await insertSale(
        DISCOUNT_COLUMNS,
        `, '${kind}', ${value}, ${amount}, 'Compra grande', ${authorizer === null ? "null" : `'${authorizer}'`}`,
      );

      const { rows } = await client.query(
        "select sale_discount_kind, sale_discount_value, sale_discount_amount from sales",
      );
      expect(rows).toEqual([
        { sale_discount_kind: kind, sale_discount_value: value, sale_discount_amount: amount },
      ]);
    },
  );

  it.each([
    ["a kind nobody records", ", 'BONUS', 10, 250, 'Motivo', null"],
    ["a percent of zero", ", 'PERCENT', 0, 0, 'Motivo', null"],
    ["a percent over one hundred", ", 'PERCENT', 101, 10, 'Motivo', null"],
    ["an amount of zero", ", 'AMOUNT', 0, 0, 'Motivo', null"],
    ["a negative amount taken off", ", 'AMOUNT', 300, -1, 'Motivo', null"],
    ["a kind without its value", ", 'AMOUNT', null, 300, 'Motivo', null"],
    ["a value without its kind", ", null, 10, null, 'Motivo', null"],
    ["a kind without its amount taken off", ", 'AMOUNT', 300, null, 'Motivo', null"],
    ["an amount taken off without its kind", ", null, null, 300, 'Motivo', null"],
    ["a kind without its reason", ", 'AMOUNT', 300, 300, null, null"],
    ["a blank reason", ", 'AMOUNT', 300, 300, '  ', null"],
    ["a reason without its kind", ", null, null, null, 'Motivo', null"],
    ["an authorizer without a discount", ", null, null, null, null, 'supervisor'"],
  ])("refuses %s", async (_case, values) => {
    const { insertSale, migrated } = await databaseBefore();
    await migrated();

    await expect(insertSale(DISCOUNT_COLUMNS, values)).rejects.toThrow(/sales_sale_discount/);
  });

  it("records a line's share of the discount", async () => {
    const { client, insertSale, insertLine, migrated } = await databaseBefore();
    await migrated();

    await insertLine(await insertSale(), ", sale_discount_share", ", 300");

    const { rows } = await client.query("select sale_discount_share from sale_lines");
    expect(rows).toEqual([{ sale_discount_share: 300 }]);
  });

  it("refuses a line whose share of the discount is negative", async () => {
    const { insertSale, insertLine, migrated } = await databaseBefore();
    await migrated();

    await expect(insertLine(await insertSale(), ", sale_discount_share", ", -1")).rejects.toThrow(
      /sale_lines_sale_discount_share/,
    );
  });
});
