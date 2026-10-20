import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeViolation,
  findViolations,
  readRepository,
} from "./append-only-tables-revoked.mjs";

const SCHEMA_PATH = "apps/cloud/src/platform/db/schema.ts";

function lines(...text) {
  return text.join("\n");
}

function schema(...text) {
  return { schemaPath: SCHEMA_PATH, schemaSource: lines(...text) };
}

function migration(name, ...text) {
  return { path: `apps/cloud/migrations/${name}.sql`, source: lines(...text) };
}

const APPEND_ONLY_PRICES = schema(
  'import { pgTable, uuid } from "drizzle-orm/pg-core";',
  "",
  "// Append-only: a price once charged stays what it was.",
  'export const prices = pgTable("prices", {',
  '  id: uuid("id").primaryKey(),',
  "});",
);

const PLAIN_PRICES = schema(
  'import { pgTable, uuid } from "drizzle-orm/pg-core";',
  "",
  "// A price list's current price.",
  'export const prices = pgTable("prices", {',
  '  id: uuid("id").primaryKey(),',
  "});",
);

const CREATE_PRICES = migration(
  "0000_prices",
  'CREATE TABLE "prices" (',
  '\t"id" uuid PRIMARY KEY NOT NULL',
  ");",
);

function violationsOf(definition, ...migrations) {
  return findViolations({ ...definition, migrations }).map(({ path, line, table, rule }) => ({
    path,
    line,
    table,
    rule,
  }));
}

test("accepts an append-only table whose update, delete and truncate are revoked", () => {
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke), []);
});

test("refuses an append-only table with no revoke at its schema line", () => {
  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES), [
    { path: SCHEMA_PATH, line: 4, table: "prices", rule: "marked-not-revoked" },
  ]);
});

test("refuses an append-only table with only delete revoked", () => {
  const revoke = migration("0001_revoke", 'REVOKE DELETE ON "prices" FROM cloud_app;');

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke), [
    { path: SCHEMA_PATH, line: 4, table: "prices", rule: "marked-not-revoked" },
  ]);
});

test("refuses an append-only table whose truncate is still granted", () => {
  const revoke = migration("0001_revoke", 'REVOKE UPDATE, DELETE ON "prices" FROM cloud_app;');

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke), [
    { path: SCHEMA_PATH, line: 4, table: "prices", rule: "marked-not-revoked" },
  ]);
});

test("refuses an append-only table whose update a later migration grants back", () => {
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  );
  const grant = migration("0002_grant", 'GRANT UPDATE ON "prices" TO cloud_app;');

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke, grant), [
    { path: SCHEMA_PATH, line: 4, table: "prices", rule: "marked-not-revoked" },
  ]);
});

test("refuses an append-only table that a grant on every table of the schema re-grants", () => {
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  );
  const grant = migration(
    "0002_grant",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cloud_app;",
  );

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke, grant), [
    { path: SCHEMA_PATH, line: 4, table: "prices", rule: "marked-not-revoked" },
  ]);
});

test("ignores a revoke from another role", () => {
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM offsite_dump;',
  );

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke), [
    { path: SCHEMA_PATH, line: 4, table: "prices", rule: "marked-not-revoked" },
  ]);
  assert.deepEqual(violationsOf(PLAIN_PRICES, CREATE_PRICES, revoke), []);
});

test("refuses a revoked table without the append-only comment, at the line of the revoke", () => {
  const revoke = migration(
    "0001_revoke",
    "-- the ledger never changes",
    "",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(PLAIN_PRICES, CREATE_PRICES, revoke), [
    {
      path: "apps/cloud/migrations/0001_revoke.sql",
      line: 3,
      table: "prices",
      rule: "revoked-not-marked",
    },
  ]);
});

test("accepts a table without the comment whose update is granted back on some columns", () => {
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  );
  const grant = migration(
    "0002_grant",
    'GRANT UPDATE ("printed_at", "voided_at") ON "prices" TO cloud_app;',
  );

  assert.deepEqual(violationsOf(PLAIN_PRICES, CREATE_PRICES, revoke, grant), []);
});

test("refuses an append-only table whose update granted back on some columns is revoked from them again", () => {
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  );
  const grant = migration(
    "0002_grant",
    'GRANT UPDATE ("printed_at", "voided_at") ON "prices" TO cloud_app;',
  );
  const revokeColumn = migration(
    "0003_revoke_column",
    'REVOKE UPDATE ("printed_at") ON "prices" FROM cloud_app;',
  );
  const revokeColumns = migration(
    "0004_revoke_columns",
    'REVOKE UPDATE ("voided_at") ON "prices" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke, grant, revokeColumn), [
    { path: SCHEMA_PATH, line: 4, table: "prices", rule: "marked-not-revoked" },
  ]);
  assert.deepEqual(
    violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke, grant, revokeColumn, revokeColumns),
    [],
  );
});

test("reads a revoke of update on the whole table as taking back its columns' update", () => {
  const grant = migration("0001_grant", 'GRANT UPDATE ("printed_at") ON "prices" TO cloud_app;');
  const revoke = migration(
    "0002_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, grant, revoke), []);
});

test("keeps update granted on the whole table when a column's update is revoked", () => {
  const revoke = migration(
    "0001_revoke",
    'REVOKE DELETE, TRUNCATE ON "prices" FROM cloud_app;',
    'REVOKE UPDATE ("printed_at") ON "prices" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke), [
    { path: SCHEMA_PATH, line: 4, table: "prices", rule: "marked-not-revoked" },
  ]);
});

test("accepts a table without the comment that keeps its update", () => {
  const revoke = migration("0001_revoke", 'REVOKE DELETE, TRUNCATE ON "prices" FROM cloud_app;');

  assert.deepEqual(violationsOf(PLAIN_PRICES, CREATE_PRICES, revoke), []);
});

test("reads a revoke for several tables in one statement", () => {
  const definition = schema(
    "// Append-only: a price once charged stays what it was.",
    'export const prices = pgTable("prices", {});',
    "",
    "// Append-only like prices.",
    "export const priceReviews = pgTable(",
    '  "price_reviews",',
    "  {},",
    ");",
  );
  const create = migration(
    "0000_tables",
    'CREATE TABLE "prices" ();',
    "--> statement-breakpoint",
    'CREATE TABLE "price_reviews" ();',
  );
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "prices", public."price_reviews" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(definition, create, revoke), []);
  assert.deepEqual(violationsOf(definition, create), [
    { path: SCHEMA_PATH, line: 2, table: "prices", rule: "marked-not-revoked" },
    { path: SCHEMA_PATH, line: 5, table: "price_reviews", rule: "marked-not-revoked" },
  ]);
});

test("reads unquoted table names, lower or upper case keywords, and statements split across lines", () => {
  const revoke = migration(
    "0001_revoke",
    "revoke update,",
    "  delete, truncate",
    "  on prices",
    "  from cloud_app;",
  );

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke), []);
});

test("reads a revoke split across several statements", () => {
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE ON "prices" FROM cloud_app;--> statement-breakpoint',
    'REVOKE DELETE ON "prices" FROM cloud_app;--> statement-breakpoint',
    'REVOKE TRUNCATE ON "prices" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke), []);
});

test("reads revoke all privileges as revoking update, delete and truncate", () => {
  const revoke = migration("0001_revoke", 'REVOKE ALL PRIVILEGES ON "prices" FROM cloud_app;');

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke), []);
});

test("reads past a semicolon inside a dollar-quoted block", () => {
  const block = migration(
    "0001_block",
    "DO $$",
    "BEGIN",
    "  CREATE ROLE cloud_app; REVOKE UPDATE, DELETE, TRUNCATE ON prices FROM cloud_app;",
    "END",
    "$$;",
  );

  assert.deepEqual(violationsOf(PLAIN_PRICES, CREATE_PRICES, block), []);
});

test("reads past a semicolon inside a string", () => {
  const comment = migration(
    "0001_comment",
    "COMMENT ON TABLE prices IS 'a; REVOKE UPDATE, DELETE, TRUNCATE ON prices FROM cloud_app; b';",
  );

  assert.deepEqual(violationsOf(PLAIN_PRICES, CREATE_PRICES, comment), []);
});

test("judges a table dropped by a later migration by its final state", () => {
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  );
  const drop = migration("0002_drop", 'DROP TABLE "prices" CASCADE;');

  assert.deepEqual(violationsOf(schema(""), CREATE_PRICES, revoke, drop), []);
  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke, drop), [
    { path: SCHEMA_PATH, line: 4, table: "prices", rule: "marked-not-revoked" },
  ]);
});

test("judges a table created again after a drop by the privileges of the new table", () => {
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  );
  const recreate = migration(
    "0002_recreate",
    'DROP TABLE "prices";--> statement-breakpoint',
    'CREATE TABLE IF NOT EXISTS "prices" ();',
  );

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke, recreate), [
    { path: SCHEMA_PATH, line: 4, table: "prices", rule: "marked-not-revoked" },
  ]);
});

test("keeps the revokes of a table that a create if not exists finds already there", () => {
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  );
  const createAgain = migration("0002_create_again", 'CREATE TABLE IF NOT EXISTS "prices" ();');

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, CREATE_PRICES, revoke, createAgain), []);
});

test("follows a revoked table renamed by a later migration", () => {
  const create = migration("0000_ledger", 'CREATE TABLE "orphan_prices" ();');
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "orphan_prices" FROM cloud_app;',
  );
  const rename = migration(
    "0002_rename",
    'ALTER TABLE "orphan_prices" RENAME TO "prices";--> statement-breakpoint',
    'ALTER TABLE "prices" RENAME CONSTRAINT "orphan_prices_pkey" TO "prices_pkey";',
  );

  assert.deepEqual(violationsOf(APPEND_ONLY_PRICES, create, revoke, rename), []);
  assert.deepEqual(violationsOf(PLAIN_PRICES, create, revoke, rename), [
    {
      path: "apps/cloud/migrations/0001_revoke.sql",
      line: 1,
      table: "prices",
      rule: "revoked-not-marked",
    },
  ]);
});

test("reads the append-only mark only from the comment right above the table", () => {
  const definition = schema(
    "// Append-only: a price once charged stays what it was.",
    "",
    'export const prices = pgTable("prices", {',
    "  // Append-only in spirit, but corrected in place.",
    '  id: uuid("id").primaryKey(),',
    "});",
  );

  assert.deepEqual(violationsOf(definition, CREATE_PRICES), []);
});

test("reads the append-only mark in any case, anywhere in the comment", () => {
  const definition = schema(
    "// A price once charged stays what it was, so its rows are append-only.",
    'export const prices = pgTable("prices", {});',
  );

  assert.deepEqual(violationsOf(definition, CREATE_PRICES), [
    { path: SCHEMA_PATH, line: 2, table: "prices", rule: "marked-not-revoked" },
  ]);
});

test("reads a table defined through a local function that passes its name to pgTable", () => {
  const definition = schema(
    "function priceVersions(name: string) {",
    "  return pgTable(",
    "    name,",
    '    { id: uuid("id").primaryKey() },',
    "  );",
    "}",
    "",
    "const reviewVersions = (name: string) => pgTable(name, {});",
    "",
    "// Append-only: a price once charged stays what it was.",
    'export const prices = priceVersions("prices");',
    "",
    "// Append-only like prices.",
    "export const priceReviews = reviewVersions(",
    '  "price_reviews",',
    ");",
  );
  const create = migration(
    "0000_tables",
    'CREATE TABLE "prices" ();',
    "--> statement-breakpoint",
    'CREATE TABLE "price_reviews" ();',
  );
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices", "price_reviews" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(definition, create, revoke), []);
  assert.deepEqual(violationsOf(definition, create), [
    { path: SCHEMA_PATH, line: 11, table: "prices", rule: "marked-not-revoked" },
    { path: SCHEMA_PATH, line: 14, table: "price_reviews", rule: "marked-not-revoked" },
  ]);
});

test("reads a table defined through a generic function, a generic arrow, or one taking its name after other parameters", () => {
  const definition = schema(
    "function priceVersions<T extends Record<string, Array<string>>>(name: string, extra: T) {",
    "  return pgTable(name, {});",
    "}",
    "",
    "const reviewVersions = <T extends string>(name: T) => pgTable(name, {});",
    "",
    "function costVersions(",
    "  schemaName: string,",
    "  name: string,",
    "  columns: Record<string, () => void> = {},",
    ") {",
    "  return pgTable(name, columns);",
    "}",
    "",
    "// Append-only: a price once charged stays what it was.",
    'export const prices = priceVersions("prices", { a: 1, b: 2 });',
    "",
    "// Append-only like prices.",
    'export const priceReviews = reviewVersions("price_reviews");',
    "",
    "// Append-only like prices.",
    'export const costs = costVersions("audit", "costs", { a: () => {}, b: "x,y" });',
  );
  const create = migration(
    "0000_tables",
    'CREATE TABLE "prices" ();',
    "--> statement-breakpoint",
    'CREATE TABLE "price_reviews" ();',
    "--> statement-breakpoint",
    'CREATE TABLE "costs" ();',
  );
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices", "price_reviews", "costs" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(definition, create, revoke), []);
  assert.deepEqual(violationsOf(definition, create), [
    { path: SCHEMA_PATH, line: 16, table: "prices", rule: "marked-not-revoked" },
    { path: SCHEMA_PATH, line: 19, table: "price_reviews", rule: "marked-not-revoked" },
    { path: SCHEMA_PATH, line: 22, table: "costs", rule: "marked-not-revoked" },
  ]);
});

test("reads a table name past a function-typed parameter or a string argument with a comma or parenthesis before it", () => {
  const definition = schema(
    "function costVersions(build: () => void, name: string) {",
    "  return pgTable(name, {});",
    "}",
    "",
    "function priceVersions(label: string, name: string) {",
    "  return pgTable(name, {});",
    "}",
    "",
    "// Append-only: a cost once charged stays what it was.",
    'export const costs = costVersions(() => {}, "costs");',
    "",
    "// Append-only like costs.",
    'export const prices = priceVersions("list, (current", "prices");',
  );
  const create = migration(
    "0000_tables",
    'CREATE TABLE "costs" ();',
    "--> statement-breakpoint",
    'CREATE TABLE "prices" ();',
  );
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "costs", "prices" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(definition, create, revoke), []);
  assert.deepEqual(violationsOf(definition, create), [
    { path: SCHEMA_PATH, line: 10, table: "costs", rule: "marked-not-revoked" },
    { path: SCHEMA_PATH, line: 13, table: "prices", rule: "marked-not-revoked" },
  ]);
});

test("reads a table name past comments around a helper's parameter, a helper call's argument, or pgTable's argument", () => {
  const definition = schema(
    "function priceVersions(",
    "  // The table's name, as the migrations create it.",
    "  name: string,",
    ") {",
    "  return pgTable(name, {});",
    "}",
    "",
    "function reviewVersions(/* in the database, quoted */ name: string) {",
    "  return pgTable(name, {});",
    "}",
    "",
    "// Append-only: a price once charged stays what it was.",
    "export const prices = priceVersions(",
    "  // Named as in the migrations.",
    '  "prices", // never renamed, never edited',
    ");",
    "",
    "// Append-only like prices.",
    'export const priceReviews = reviewVersions(/* kept apart, (reviewed) */ "price_reviews");',
    "",
    "// Append-only like prices.",
    "export const costs = pgTable(",
    "  // Charged costs.",
    '  "costs" /* never edited */,',
    "  {},",
    ");",
  );
  const create = migration(
    "0000_tables",
    'CREATE TABLE "prices" ();',
    "--> statement-breakpoint",
    'CREATE TABLE "price_reviews" ();',
    "--> statement-breakpoint",
    'CREATE TABLE "costs" ();',
  );
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices", "price_reviews", "costs" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(definition, create, revoke), []);
  assert.deepEqual(violationsOf(definition, create), [
    { path: SCHEMA_PATH, line: 13, table: "prices", rule: "marked-not-revoked" },
    { path: SCHEMA_PATH, line: 19, table: "price_reviews", rule: "marked-not-revoked" },
    { path: SCHEMA_PATH, line: 22, table: "costs", rule: "marked-not-revoked" },
  ]);
});

test("reads a helper's table name parameter past a comment inside its pgTable call", () => {
  const definition = schema(
    "function priceVersions(name: string) {",
    "  return pgTable(",
    "    // As the migrations create it.",
    "    name,",
    "    {},",
    "  );",
    "}",
    "",
    "function reviewVersions(name: string) {",
    "  return pgTable(/* quoted in the database */ name, {});",
    "}",
    "",
    "// Append-only: a price once charged stays what it was.",
    'export const prices = priceVersions("prices");',
    "",
    "// Append-only like prices.",
    'export const priceReviews = reviewVersions("price_reviews");',
  );
  const create = migration(
    "0000_tables",
    'CREATE TABLE "prices" ();',
    "--> statement-breakpoint",
    'CREATE TABLE "price_reviews" ();',
  );
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices", "price_reviews" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(definition, create, revoke), []);
  assert.deepEqual(violationsOf(definition, create), [
    { path: SCHEMA_PATH, line: 14, table: "prices", rule: "marked-not-revoked" },
    { path: SCHEMA_PATH, line: 17, table: "price_reviews", rule: "marked-not-revoked" },
  ]);
});

test("reads a table defined through an arrow function with a comment above its parameters", () => {
  const definition = schema(
    "const priceVersions =",
    "  // Each version is a row of its own.",
    "  (name: string) => pgTable(name, {});",
    "",
    "const reviewVersions = /* one per review */ <T extends string>(name: T) => pgTable(name, {});",
    "",
    "// Append-only: a price once charged stays what it was.",
    'export const prices = priceVersions("prices");',
    "",
    "// Append-only like prices.",
    'export const priceReviews = reviewVersions("price_reviews");',
  );
  const create = migration(
    "0000_tables",
    'CREATE TABLE "prices" ();',
    "--> statement-breakpoint",
    'CREATE TABLE "price_reviews" ();',
  );
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices", "price_reviews" FROM cloud_app;',
  );

  assert.deepEqual(violationsOf(definition, create, revoke), []);
  assert.deepEqual(violationsOf(definition, create), [
    { path: SCHEMA_PATH, line: 8, table: "prices", rule: "marked-not-revoked" },
    { path: SCHEMA_PATH, line: 11, table: "price_reviews", rule: "marked-not-revoked" },
  ]);
});

test("reads an arrow function's table past a comment on an earlier declaration", () => {
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  );

  for (const label of ['const label = /* plain */ "x";', 'const label = // see /* plain\n  "x";']) {
    const definition = schema(
      label,
      "const priceVersions = /* one per version */ (name: string) => pgTable(name, {});",
      "",
      "// Append-only: a price once charged stays what it was.",
      'export const prices = priceVersions("prices");',
    );
    const line =
      definition.schemaSource
        .split("\n")
        .indexOf('export const prices = priceVersions("prices");') + 1;

    assert.deepEqual(violationsOf(definition, CREATE_PRICES, revoke), []);
    assert.deepEqual(violationsOf(definition, CREATE_PRICES), [
      { path: SCHEMA_PATH, line, table: "prices", rule: "marked-not-revoked" },
    ]);
  }
});

test("names the table, where it is, and the rule it breaks", () => {
  const marked = findViolations({ ...APPEND_ONLY_PRICES, migrations: [CREATE_PRICES] }).map(
    describeViolation,
  );
  const revoke = migration(
    "0001_revoke",
    'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  );
  const unmarked = findViolations({
    ...PLAIN_PRICES,
    migrations: [CREATE_PRICES, revoke],
  }).map(describeViolation);

  assert.equal(marked.length, 1);
  assert.match(marked[0], /^apps\/cloud\/src\/platform\/db\/schema\.ts:4: /);
  assert.match(marked[0], /"prices" is marked append-only/);
  assert.match(marked[0], /UPDATE, DELETE, TRUNCATE/);
  assert.equal(unmarked.length, 1);
  assert.match(unmarked[0], /^apps\/cloud\/migrations\/0001_revoke\.sql:1: /);
  assert.match(unmarked[0], /"prices" has UPDATE and DELETE revoked from cloud_app/);
  assert.match(unmarked[0], /no "Append-only" comment/);
});

test("reads the migrations in the order the journal lists them", () => {
  const files = {
    "apps/cloud/src/platform/db/schema.ts": APPEND_ONLY_PRICES.schemaSource,
    "apps/cloud/migrations/meta/_journal.json": JSON.stringify({
      entries: [{ tag: "0001_revoke" }, { tag: "0000_create" }],
    }),
    "apps/cloud/migrations/0000_create.sql": CREATE_PRICES.source,
    "apps/cloud/migrations/0001_revoke.sql":
      'REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;',
  };

  const repository = readRepository("/repo", (path) => files[path.replace(/^\/repo\//, "")]);

  assert.deepEqual(
    repository.migrations.map((entry) => entry.path),
    ["apps/cloud/migrations/0001_revoke.sql", "apps/cloud/migrations/0000_create.sql"],
  );
  assert.deepEqual(findViolations(repository), [
    {
      path: SCHEMA_PATH,
      line: 4,
      table: "prices",
      rule: "marked-not-revoked",
    },
  ]);
});

test("every append-only cloud table has its revoke, and every revoked one is marked", () => {
  const repository = readRepository();
  assert.ok(repository.migrations.length > 0, "expected to find the cloud's migrations");

  assert.deepEqual(findViolations(repository).map(describeViolation), []);
});
