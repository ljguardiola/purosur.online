import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeViolation,
  findUndeclaredRedeliveries,
  readMigrations,
  readPulledTables,
} from "./pulled-table-redelivery.mjs";

const PULLED_TABLES = { products: "product", tags: "tag" };

const BASE = {
  name: "0001_base",
  sql: "CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT); CREATE TABLE sale_lines (id TEXT PRIMARY KEY);",
};

const DECLARATION_TABLE = {
  name: "0002_redeliveries",
  sql: "CREATE TABLE pulled_table_redeliveries (table_name TEXT PRIMARY KEY, cursor INTEGER NOT NULL DEFAULT 0);",
};

function violationsOf(...migrations) {
  return findUndeclaredRedeliveries({ migrations, pulledTables: PULLED_TABLES });
}

function after(sql, name = "0003_change") {
  return violationsOf(BASE, DECLARATION_TABLE, { name, sql });
}

const MISSING_BARCODE = [{ migration: "0003_change", table: "products", columns: ["barcode"] }];

function declaring(table) {
  return `INSERT INTO pulled_table_redeliveries (table_name) VALUES ('${table}') ON CONFLICT (table_name) DO UPDATE SET cursor = 0;`;
}

test("flags a column added to a pulled table without declaring the table", () => {
  assert.deepEqual(after("ALTER TABLE products ADD COLUMN barcode TEXT;"), MISSING_BARCODE);
});

test("flags a column added without the COLUMN keyword", () => {
  assert.deepEqual(after("ALTER TABLE products ADD barcode TEXT;"), MISSING_BARCODE);
});

test("flags a column added through quoted identifiers", () => {
  assert.deepEqual(after('ALTER TABLE "products" ADD COLUMN "barcode" TEXT;'), MISSING_BARCODE);
});

test("flags a column added by rebuilding the table under its old name", () => {
  const rebuild = [
    "CREATE TABLE products_new (id TEXT PRIMARY KEY, name TEXT, barcode TEXT);",
    "INSERT INTO products_new (id, name) SELECT id, name FROM products;",
    "DROP TABLE products;",
    "ALTER TABLE products_new RENAME TO products;",
  ].join("\n");

  assert.deepEqual(after(rebuild), MISSING_BARCODE);
});

test("names every column a migration added to the same table", () => {
  assert.deepEqual(
    after(
      "ALTER TABLE products ADD COLUMN barcode TEXT; ALTER TABLE products ADD COLUMN brand TEXT;",
    ),
    [{ migration: "0003_change", table: "products", columns: ["barcode", "brand"] }],
  );
});

test("accepts a column added to a table the same migration declares from the first change", () => {
  const sql = ["ALTER TABLE products ADD COLUMN barcode TEXT;", declaring("products")].join("\n");

  assert.deepEqual(after(sql), []);
});

test("flags a column added to a table when only another pulled table is declared", () => {
  const sql = ["ALTER TABLE products ADD COLUMN barcode TEXT;", declaring("tags")].join("\n");

  assert.deepEqual(after(sql), MISSING_BARCODE);
});

test("flags a declaration that keeps the cursor of a redelivery the register has under way", () => {
  const sql = [
    "ALTER TABLE products ADD COLUMN barcode TEXT;",
    "INSERT OR IGNORE INTO pulled_table_redeliveries (table_name) VALUES ('products');",
  ].join("\n");

  assert.deepEqual(after(sql), MISSING_BARCODE);
});

test("flags a declaration that fails on a register still redelivering the table", () => {
  const sql = [
    "ALTER TABLE products ADD COLUMN barcode TEXT;",
    "INSERT INTO pulled_table_redeliveries (table_name) VALUES ('products');",
  ].join("\n");

  assert.deepEqual(after(sql), [
    {
      migration: "0003_change",
      failure: "UNIQUE constraint failed: pulled_table_redeliveries.table_name",
    },
  ]);
});

test("does not let a declaration of an earlier migration cover a later migration's column", () => {
  const declared = {
    name: "0003_declared",
    sql: `ALTER TABLE products ADD COLUMN barcode TEXT; ${declaring("products")}`,
  };
  const later = { name: "0004_later", sql: "ALTER TABLE products ADD COLUMN brand TEXT;" };

  assert.deepEqual(violationsOf(BASE, DECLARATION_TABLE, declared, later), [
    { migration: "0004_later", table: "products", columns: ["brand"] },
  ]);
});

test("accepts a column added to a table the register does not fill from a pull", () => {
  assert.deepEqual(after("ALTER TABLE sale_lines ADD COLUMN note TEXT;"), []);
});

test("accepts a migration that adds no column to a pulled table", () => {
  const rebuild = [
    "CREATE TABLE products_new (id TEXT PRIMARY KEY, name TEXT);",
    "INSERT INTO products_new SELECT id, name FROM products;",
    "DROP TABLE products;",
    "ALTER TABLE products_new RENAME TO products;",
    "CREATE INDEX products_by_name ON products (name);",
  ].join("\n");

  assert.deepEqual(after(rebuild), []);
});

test("accepts a pulled table created by the migration, which no register holds rows of yet", () => {
  assert.deepEqual(after("CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT);"), []);
});

test("ignores the migrations before the table of declarations exists", () => {
  const early = { name: "0002_early", sql: "ALTER TABLE products ADD COLUMN barcode TEXT;" };
  const declarationTable = { ...DECLARATION_TABLE, name: "0003_redeliveries" };

  assert.deepEqual(violationsOf(BASE, early, declarationTable), []);
});

test("checks the migration that creates the table of declarations like any other", () => {
  const creating = {
    name: "0002_redeliveries",
    sql: `ALTER TABLE products ADD COLUMN barcode TEXT; ${DECLARATION_TABLE.sql}`,
  };

  assert.deepEqual(violationsOf(BASE, creating), [
    { migration: "0002_redeliveries", table: "products", columns: ["barcode"] },
  ]);
});

test("applies the migrations in the order of their names", () => {
  const change = { name: "0003_change", sql: "ALTER TABLE products ADD COLUMN barcode TEXT;" };

  assert.deepEqual(violationsOf(change, DECLARATION_TABLE, BASE), MISSING_BARCODE);
});

test("describes a violation by migration, table and columns", () => {
  assert.equal(
    describeViolation({
      migration: "0003_change",
      table: "products",
      columns: ["barcode", "brand"],
    }),
    "0003_change: products gained barcode, brand without its redelivery being declared from the first change in pulled_table_redeliveries",
  );
});

test("describes a failed migration by migration and failure", () => {
  assert.equal(
    describeViolation({
      migration: "0003_change",
      failure: "UNIQUE constraint failed: pulled_table_redeliveries.table_name",
    }),
    "0003_change: fails on a register redelivering every pulled table: UNIQUE constraint failed: pulled_table_redeliveries.table_name",
  );
});

test("the register's migrations declare every pulled table they add a column to", async () => {
  const migrations = readMigrations();
  const pulledTables = await readPulledTables();

  assert.ok(migrations.some(({ sql }) => /CREATE TABLE pulled_table_redeliveries\b/.test(sql)));
  assert.ok("register_point_of_sale" in pulledTables);
  assert.deepEqual(
    findUndeclaredRedeliveries({ migrations, pulledTables }).map(describeViolation),
    [],
    "declare the table in the migration: INSERT INTO pulled_table_redeliveries (table_name) VALUES ('<table>') ON CONFLICT (table_name) DO UPDATE SET cursor = 0",
  );
});
