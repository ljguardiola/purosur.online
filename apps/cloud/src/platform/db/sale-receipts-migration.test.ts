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

async function saleReceiptsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_sale_receipts",
    "test setup: no sale receipts migration in the journal",
  );
}

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "sale-receipts-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await saleReceiptsEntry());
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
  const userId = await first(
    "insert into users (first_name, email, location_id) values ('Ada', 'ada@example.com', $1) returning id",
    [locationId],
  );
  const saleId = await first(
    `insert into sales (id, location_id, register_id, device_id, session_id, actor_id, state, completed_at, total, applied_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'COMPLETED', now(), 2500, now()) returning id`,
    [locationId, registerId, deviceId, sessionId, userId],
  );
  const migrated = async () => {
    await addMigrationEntry(folder, await saleReceiptsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });
  };
  return { client, migrated, saleId, registerId, deviceId, sessionId, locationId, userId };
}

describe("the sale receipts migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every recorded sale, none of them printed or numbered", async () => {
    const { client, migrated, saleId } = await databaseBefore();

    await migrated();

    const { rows } = await client.query(
      "select id, total, print_attempted_at, printed_at, operation_number from sales",
    );
    expect(rows).toEqual([
      {
        id: saleId,
        total: 2500,
        print_attempted_at: null,
        printed_at: null,
        operation_number: null,
      },
    ]);
  });

  it("records when a sale's receipt was attempted, printed and its operation number", async () => {
    const { client, migrated, saleId } = await databaseBefore();
    await migrated();

    await client.query(
      `update sales set print_attempted_at = '2026-10-06T11:21:00Z', printed_at = '2026-10-06T11:21:05Z', operation_number = 482 where id = $1`,
      [saleId],
    );

    const { rows } = await client.query("select operation_number from sales");
    expect(rows).toEqual([{ operation_number: 482 }]);
  });

  it("refuses a printed receipt that was never attempted and an operation number that is not positive", async () => {
    const { client, migrated, saleId } = await databaseBefore();
    await migrated();

    await expect(
      client.query("update sales set printed_at = now() where id = $1", [saleId]),
    ).rejects.toThrow(/sales_printed_only_after_attempted_check/);
    await expect(
      client.query("update sales set operation_number = 0 where id = $1", [saleId]),
    ).rejects.toThrow(/sales_operation_number_positive_check/);
  });

  it("keeps a reprint of a sale with who asked for it and who authorized it", async () => {
    const { client, migrated, saleId, userId } = await databaseBefore();
    await migrated();

    await client.query(
      `insert into sale_reprints (sale_id, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at)
       values ($1, 1, $2, null, 'retry', null, now()), ($1, 2, $2, $2, 'requested', 'El cliente la perdio', now())`,
      [saleId, userId],
    );

    const { rows } = await client.query(
      "select order_number, reason_kind, reason_text, authorized_by from sale_reprints order by order_number",
    );
    expect(rows).toEqual([
      { order_number: 1, reason_kind: "retry", reason_text: null, authorized_by: null },
      {
        order_number: 2,
        reason_kind: "requested",
        reason_text: "El cliente la perdio",
        authorized_by: userId,
      },
    ]);
  });

  it("refuses a reprint whose reason text does not match its kind, or whose kind is unknown", async () => {
    const { client, migrated, saleId, userId } = await databaseBefore();
    await migrated();
    const insert = (kind: string, text: string | null) =>
      client.query(
        `insert into sale_reprints (sale_id, order_number, requested_by, reason_kind, reason_text, occurred_at)
         values ($1, 1, $2, $3, $4, now())`,
        [saleId, userId, kind, text],
      );

    await expect(insert("requested", null)).rejects.toThrow(
      /sale_reprints_reason_matches_kind_check/,
    );
    await expect(insert("retry", "texto")).rejects.toThrow(
      /sale_reprints_reason_matches_kind_check/,
    );
    await expect(insert("other", null)).rejects.toThrow(/sale_reprints_reason_kind_check/);
  });

  it("refuses a second reprint with the same order number, and a reprint of a sale that does not exist", async () => {
    const { client, migrated, saleId, userId } = await databaseBefore();
    await migrated();
    const insert = (id: string, orderNumber: number) =>
      client.query(
        `insert into sale_reprints (sale_id, order_number, requested_by, reason_kind, occurred_at)
         values ($1, $2, $3, 'retry', now())`,
        [id, orderNumber, userId],
      );
    await insert(saleId, 1);

    await expect(insert(saleId, 1)).rejects.toThrow(/sale_reprints_sale_id_order_number_pk/);
    await expect(insert("0d9c4f6e-2b1a-4c3d-8e5f-6a7b8c9d0e1f", 1)).rejects.toThrow(
      /sale_reprints_sale_id_sales_id_fk/,
    );
    await expect(insert(saleId, 0)).rejects.toThrow(/sale_reprints_order_number_positive_check/);
  });
});
