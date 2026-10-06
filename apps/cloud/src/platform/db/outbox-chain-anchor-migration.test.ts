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

async function anchorEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_outbox_chain_anchor",
    "test setup: no outbox chain anchor migration in the journal",
  );
}

describe("the outbox chain anchor migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("anchors each installation on the chain value of the last event its inbox holds", async () => {
    const folder = await mkdtemp(join(tmpdir(), "outbox-chain-anchor-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await anchorEntry());
    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());
    const { rows: locationRows } = await client.query<{ id: string }>(
      "select id from locations limit 1",
    );
    const { rows: registerRows } = await client.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, 'Caja 1') returning id",
      [locationRows[0]?.id],
    );
    const installation = async (prefix: string) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into register_installations
           (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
         values ($1, $2, 'hash', now(), 'CAJA', 'Windows 11', now()) returning id`,
        [registerRows[0]?.id, prefix],
      );
      const id = rows[0]?.id;
      await client.query(
        "insert into device_state (device_id, app_version, last_pushed_at) values ($1, '1.4.0', now())",
        [id],
      );
      return id;
    };
    const pushed = await installation("pushed");
    const silent = await installation("silent");
    for (const [seq, link] of [
      [2, "link-2"],
      [1, "link-1"],
    ] as const) {
      await client.query(
        `insert into inbox
           (event_id, device_id, device_seq, aggregate_type, aggregate_id, event_type,
            schema_version, payload, occurred_at, actor_id, chain_hmac, received_at)
         values (gen_random_uuid(), $1, $2, 'Sale', 'sale-1', 'sale_completed', 1, '{}', now(),
                 'user-1', $3, now())`,
        [pushed, seq, link],
      );
    }

    await addMigrationEntry(folder, await anchorEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows } = await client.query<{ device_id: string; last_chain_hmac: string | null }>(
      "select device_id, last_chain_hmac from device_state",
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { device_id: pushed, last_chain_hmac: "link-2" },
        { device_id: silent, last_chain_hmac: null },
      ]),
    );
    expect(rows).toHaveLength(2);
  });
});
