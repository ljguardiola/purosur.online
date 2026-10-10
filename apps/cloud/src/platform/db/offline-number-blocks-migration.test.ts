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

async function offlineNumberBlocksEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_offline_number_blocks",
    "test setup: no offline number blocks migration in the journal",
  );
}

async function databaseBeforeMigration() {
  const folder = await mkdtemp(join(tmpdir(), "offline-number-blocks-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await offlineNumberBlocksEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  return { folder, client };
}

type Client = Awaited<ReturnType<typeof databaseBeforeMigration>>["client"];

async function applyMigration(folder: string, client: Client) {
  await addMigrationEntry(folder, await offlineNumberBlocksEntry());
  await migrate(drizzle(client), { migrationsFolder: folder });
}

async function migratedDatabase() {
  const { folder, client } = await databaseBeforeMigration();
  await applyMigration(folder, client);
  return client;
}

async function claimOfflinePointOfSale(
  client: Client,
  pointOfSaleNumber: number,
  mechanism = "offline",
) {
  const { rows } = await client.query<{ id: string }>(
    `insert into registers (location_id, name)
     select id, 'Caja ' || $1::text from locations limit 1 returning id`,
    [pointOfSaleNumber],
  );
  const registerId = rows[0]?.id;
  await client.query(
    `insert into users (first_name, email, location_id)
     select 'Ada Lucero', 'ada' || $1::text || '@example.com', id from locations limit 1`,
    [pointOfSaleNumber],
  );
  await client.query(
    `insert into point_of_sale_claims (point_of_sale_number, register_id, mechanism, claimed_by)
     select $1, $2, $3::point_of_sale_mechanism, id from users where email = 'ada' || $1::text || '@example.com'`,
    [pointOfSaleNumber, registerId, mechanism],
  );
  return registerId;
}

const insertBlock = (
  pointOfSaleNumber: number,
  registerId: string | undefined,
  overrides: { documentType?: string; first?: number; last?: number; status?: string } = {},
) => ({
  text: `insert into offline_number_blocks
           (point_of_sale_number, document_type, register_id, first_number, last_number, status, assigned_at, version)
         values ($1, $2, $3, $4, $5, $6, '2026-10-01T12:00:00Z', 1)`,
  values: [
    pointOfSaleNumber,
    overrides.documentType ?? "factura_c",
    registerId,
    overrides.first ?? 1,
    overrides.last ?? 1000,
    overrides.status ?? "in_use",
  ],
});

describe("the offline number blocks migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("gives every code already held an identity of its own", async () => {
    const { folder, client } = await databaseBeforeMigration();
    for (const [start, end] of [
      ["2026-10-01", "2026-10-15"],
      ["2026-10-16", "2026-10-31"],
    ]) {
      await client.query(
        `insert into caea_codes
           (fortnight_start, fortnight_end, code, report_deadline, obtained_at, obtained_through)
         values ($1, $2, '21403471111111', '2026-11-15', '2026-09-28T12:00:00Z', 'requested')`,
        [start, end],
      );
    }

    await applyMigration(folder, client);

    const { rows } = await client.query<{ id: string }>("select id from caea_codes");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
  });

  it("gives a code obtained after it an identity too", async () => {
    const client = await migratedDatabase();

    await client.query(
      `insert into caea_codes
         (fortnight_start, fortnight_end, code, report_deadline, obtained_at, obtained_through)
       values ('2026-10-01', '2026-10-15', '21403471111111', '2026-11-15', '2026-09-28T12:00:00Z', 'requested')`,
    );

    const { rows } = await client.query<{ id: string | null }>("select id from caea_codes");
    expect(rows[0]?.id).toEqual(expect.any(String));
  });

  it("lets a change be about a register, and leaves the changes already logged about none", async () => {
    const { folder, client } = await databaseBeforeMigration();
    await client.query(
      `insert into changes (entity, entity_id, version, op)
       values ('category', gen_random_uuid(), 1, 'insert')`,
    );
    await applyMigration(folder, client);

    await client.query(
      `insert into changes (entity, entity_id, version, op, register_id)
       values ('offline_number_block', gen_random_uuid(), 1, 'insert', gen_random_uuid())`,
    );

    const { rows } = await client.query<{ entity: string; has_register: boolean }>(
      "select entity, register_id is not null as has_register from changes order by change_seq",
    );
    expect(rows).toEqual([
      { entity: "category", has_register: false },
      { entity: "offline_number_block", has_register: true },
    ]);
  });

  it("keeps blocks of consecutive ranges of an offline point of sale and of another", async () => {
    const client = await migratedDatabase();
    const first = await claimOfflinePointOfSale(client, 7);
    const second = await claimOfflinePointOfSale(client, 8);

    const blocks = [
      insertBlock(7, first),
      insertBlock(7, first, { first: 1001, last: 2000 }),
      insertBlock(8, second),
    ];
    for (const block of blocks) {
      await client.query(block.text, block.values);
    }

    const { rows } = await client.query(
      "select point_of_sale_number, first_number, last_number, status from offline_number_blocks order by 1, 2",
    );
    expect(rows).toEqual([
      { point_of_sale_number: 7, first_number: 1, last_number: 1000, status: "in_use" },
      { point_of_sale_number: 7, first_number: 1001, last_number: 2000, status: "in_use" },
      { point_of_sale_number: 8, first_number: 1, last_number: 1000, status: "in_use" },
    ]);
  });

  it.each([
    ["a second block starting at the same number", { first: 1, last: 500 }],
    ["a second block ending at the same number", { first: 500, last: 1000 }],
  ])("refuses %s for the same point of sale and document type", async (_case, overrides) => {
    const client = await migratedDatabase();
    const registerId = await claimOfflinePointOfSale(client, 7);
    const block = insertBlock(7, registerId);
    await client.query(block.text, block.values);

    const other = insertBlock(7, registerId, overrides);
    await expect(client.query(other.text, other.values)).rejects.toThrow();
  });

  it.each([
    ["a document type it does not know", { documentType: "factura_a" }],
    ["a status it does not know", { status: "used_up" }],
    ["a first number below the first of the series", { first: 0, last: 999 }],
    ["a last number before its first", { first: 1001, last: 1000 }],
  ])("refuses a block with %s", async (_case, overrides) => {
    const client = await migratedDatabase();
    const registerId = await claimOfflinePointOfSale(client, 7);

    const block = insertBlock(7, registerId, overrides);
    await expect(client.query(block.text, block.values)).rejects.toThrow();
  });

  it("refuses a block for a register that did not claim the point of sale", async () => {
    const client = await migratedDatabase();
    await claimOfflinePointOfSale(client, 7);
    const another = await claimOfflinePointOfSale(client, 8);

    const block = insertBlock(7, another);
    await expect(client.query(block.text, block.values)).rejects.toThrow();
  });

  it("refuses a block for a point of sale claimed for real-time authorization", async () => {
    const client = await migratedDatabase();
    const registerId = await claimOfflinePointOfSale(client, 7, "real_time");

    const block = insertBlock(7, registerId);
    await expect(client.query(block.text, block.values)).rejects.toThrow();
  });
});
