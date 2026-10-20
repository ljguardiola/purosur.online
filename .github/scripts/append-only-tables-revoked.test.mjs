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

test("reads past a semicolon inside a dollar-quoted block or a string", () => {
  const revoke = migration(
    "0001_revoke",
    "DO $$",
    "BEGIN",
    "  CREATE ROLE cloud_app; REVOKE UPDATE ON prices FROM cloud_app;",
    "END",
    "$$;",
    "--> statement-breakpoint",
    "COMMENT ON TABLE prices IS 'a; REVOKE DELETE ON prices FROM cloud_app';",
  );

  assert.deepEqual(violationsOf(PLAIN_PRICES, CREATE_PRICES, revoke), []);
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
