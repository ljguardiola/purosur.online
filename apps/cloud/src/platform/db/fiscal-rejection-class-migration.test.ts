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

async function rejectionClassEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_fiscal_rejection_class",
    "test setup: no fiscal-rejection-class migration in the journal",
  );
}

const INSERT_REQUEST = `insert into fiscal_requests
  (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total,
   buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, rejection_codes,
   answered_at)
  values (gen_random_uuid(), $1, gen_random_uuid(), 3, $2, '2026-10-06', 1500, 5, '{}'::jsonb,
          now(), now(), $3, $4, $5)`;

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "fiscal-rejection-class-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await rejectionClassEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const { rows } = await client.query<{ id: string }>(
    "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id",
  );
  const registerId = rows[0]?.id;
  const applyMigration = async () => {
    await addMigrationEntry(folder, await rejectionClassEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });
  };
  return { client, registerId, applyMigration };
}

describe("the fiscal-rejection-class migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps a request that was answered unclear, with no rejection class", async () => {
    const { client, registerId, applyMigration } = await databaseBefore();
    await client.query(INSERT_REQUEST, [registerId, 1, "unclear", null, new Date()]);

    await applyMigration();

    const { rows } = await client.query("select answer_kind, rejection_class from fiscal_requests");
    expect(rows).toEqual([{ answer_kind: "unclear", rejection_class: null }]);
  });

  it.each(["content", "standing"])(
    "accepts a rejected answer of class %s",
    async (rejectionClass) => {
      const { client, registerId, applyMigration } = await databaseBefore();
      await applyMigration();

      await client.query(
        "insert into fiscal_requests (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total, buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, rejection_codes, rejection_class, answered_at) values (gen_random_uuid(), $1, gen_random_uuid(), 3, 1, '2026-10-06', 1500, 5, '{}'::jsonb, now(), now(), 'rejected', '{10015}', $2, now())",
        [registerId, rejectionClass],
      );

      const { rows } = await client.query("select rejection_class from fiscal_requests");
      expect(rows).toEqual([{ rejection_class: rejectionClass }]);
    },
  );

  it("refuses a rejected answer without its class", async () => {
    const { client, registerId, applyMigration } = await databaseBefore();
    await applyMigration();

    await expect(
      client.query(INSERT_REQUEST, [registerId, 1, "rejected", [10015], new Date()]),
    ).rejects.toThrow();
  });

  it("refuses a class on an answer that is not a rejection", async () => {
    const { client, registerId, applyMigration } = await databaseBefore();
    await applyMigration();

    await expect(
      client.query(
        "insert into fiscal_requests (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total, buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, rejection_class, answered_at) values (gen_random_uuid(), $1, gen_random_uuid(), 3, 1, '2026-10-06', 1500, 5, '{}'::jsonb, now(), now(), 'unclear', 'content', now())",
        [registerId],
      ),
    ).rejects.toThrow();
  });

  it("refuses a class nobody knows", async () => {
    const { client, registerId, applyMigration } = await databaseBefore();
    await applyMigration();

    await expect(
      client.query(
        "insert into fiscal_requests (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total, buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, rejection_codes, rejection_class, answered_at) values (gen_random_uuid(), $1, gen_random_uuid(), 3, 1, '2026-10-06', 1500, 5, '{}'::jsonb, now(), now(), 'rejected', '{10015}', 'transport', now())",
        [registerId],
      ),
    ).rejects.toThrow();
  });
});
