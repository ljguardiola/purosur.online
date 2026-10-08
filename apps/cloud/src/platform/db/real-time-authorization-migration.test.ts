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

async function realTimeAuthorizationEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_real_time_authorization",
    "test setup: no real-time authorization migration in the journal",
  );
}

async function databaseAfterMigration() {
  const folder = await mkdtemp(join(tmpdir(), "real-time-authorization-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await realTimeAuthorizationEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const { rows: registerRows } = await client.query<{ id: string }>(
    "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id",
  );
  const registerId = registerRows[0]?.id;
  await addMigrationEntry(folder, await realTimeAuthorizationEntry());
  await migrate(drizzle(client), { migrationsFolder: folder });
  return { client, registerId };
}

const INSERT_REQUEST = `insert into fiscal_requests
  (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total,
   buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, authorization_code,
   authorization_code_due_on, rejection_codes, answered_at)
  values (gen_random_uuid(), $1, gen_random_uuid(), 3, 1, '2026-10-06', 1500, 5, '{}'::jsonb,
          now(), now(), $2, $3, $4, $5, $6)`;

describe("the real-time authorization migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps the existing register and starts with no request, no evidence and no count", async () => {
    const { client } = await databaseAfterMigration();

    const { rows: registers } = await client.query("select name from registers");
    const { rows: requests } = await client.query("select 1 from fiscal_requests");
    const { rows: evidence } = await client.query("select 1 from arca_invoicing_evidence");
    const { rows: counts } = await client.query(
      "select 1 from tax_authority_last_authorized_numbers",
    );
    expect(registers).toEqual([{ name: "Caja 1" }]);
    expect([requests, evidence, counts]).toEqual([[], [], []]);
  });

  it("accepts a request that is still waiting for its answer", async () => {
    const { client, registerId } = await databaseAfterMigration();

    await client.query(INSERT_REQUEST, [registerId, null, null, null, null, null]);

    const { rows } = await client.query("select answer_kind from fiscal_requests");
    expect(rows).toEqual([{ answer_kind: null }]);
  });

  it("accepts each kind of answer with the data that kind carries", async () => {
    const { client, registerId } = await databaseAfterMigration();

    await client.query(INSERT_REQUEST, [
      registerId,
      "authorized",
      "74123456789012",
      "2026-10-16",
      null,
      new Date(),
    ]);
    await client.query(INSERT_REQUEST, [registerId, "rejected", null, null, [10015], new Date()]);
    await client.query(INSERT_REQUEST, [registerId, "not_attempted", null, null, null, new Date()]);
    await client.query(INSERT_REQUEST, [registerId, "unclear", null, null, null, new Date()]);

    const { rows } = await client.query("select answer_kind from fiscal_requests");
    expect(rows).toHaveLength(4);
  });

  it("refuses an authorized answer without its authorization code", async () => {
    const { client, registerId } = await databaseAfterMigration();

    await expect(
      client.query(INSERT_REQUEST, [registerId, "authorized", null, null, null, new Date()]),
    ).rejects.toThrow();
  });

  it("refuses authorization data on an answer that is not an authorization", async () => {
    const { client, registerId } = await databaseAfterMigration();

    await expect(
      client.query(INSERT_REQUEST, [
        registerId,
        "unclear",
        "74123456789012",
        "2026-10-16",
        null,
        new Date(),
      ]),
    ).rejects.toThrow();
  });

  it("refuses a rejected answer without its rejection codes", async () => {
    const { client, registerId } = await databaseAfterMigration();

    await expect(
      client.query(INSERT_REQUEST, [registerId, "rejected", null, null, null, new Date()]),
    ).rejects.toThrow();
  });

  it("refuses an answer that has no answer time", async () => {
    const { client, registerId } = await databaseAfterMigration();

    await expect(
      client.query(INSERT_REQUEST, [registerId, "unclear", null, null, null, null]),
    ).rejects.toThrow();
  });

  it("keeps the evidence of a successful invoicing call in a single row", async () => {
    const { client } = await databaseAfterMigration();

    await client.query("insert into arca_invoicing_evidence (last_call_ok_at) values (now())");

    await expect(
      client.query("insert into arca_invoicing_evidence (last_call_ok_at) values (now())"),
    ).rejects.toThrow();
  });

  it("keeps one count per point of sale", async () => {
    const { client } = await databaseAfterMigration();
    const insert = `insert into tax_authority_last_authorized_numbers
      (point_of_sale_number, last_authorized, read_at) values (3, 41, now())`;
    await client.query(insert);

    await expect(client.query(insert)).rejects.toThrow();
  });
});
