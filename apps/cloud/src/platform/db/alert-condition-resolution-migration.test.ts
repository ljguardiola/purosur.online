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

async function alertConditionResolutionEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_alert_condition_resolution",
    "test setup: no alert condition resolution migration in the journal",
  );
}

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "alert-condition-resolution-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await alertConditionResolutionEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const { rows: locationRows } = await client.query<{ id: string }>(
    "select id from locations limit 1",
  );
  const installation = async (name: string) => {
    const { rows: registerRows } = await client.query<{ id: string }>(
      "insert into registers (location_id, name) values ($1, $2) returning id",
      [locationRows[0]?.id, name],
    );
    const { rows } = await client.query<{ id: string }>(
      `insert into register_installations
         (register_id, token_lookup_prefix, token_hash, token_issued_at, hostname, windows_version, enrolled_at)
       values ($1, $2, 'hash', now(), $2, 'Windows 11', now()) returning id`,
      [registerRows[0]?.id, name],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("test setup: inserting the installation returned no row");
    return id;
  };
  const applyMigration = async () => {
    await addMigrationEntry(folder, await alertConditionResolutionEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });
  };
  return { client, installation, applyMigration };
}

describe("the alert condition resolution migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("leaves every open alert without a cleared-condition mark", async () => {
    const { client, applyMigration } = await databaseBefore();
    await client.query(
      `insert into alerts (kind, scope, level, audience, detail, opened_at)
       values ('user_email_changed', 'user-1', 'warning', 'all', '{}', '2026-10-06T11:20:00Z')`,
    );

    await applyMigration();

    const { rows } = await client.query("select condition_cleared_at from alerts");
    expect(rows).toEqual([{ condition_cleared_at: null }]);
  });

  it("gives a device state whose installation's inbox received nothing no last accepted push", async () => {
    const { client, installation, applyMigration } = await databaseBefore();
    const deviceId = await installation("Caja 1");
    await client.query(
      "insert into device_state (device_id, last_pushed_at) values ($1, '2026-10-06T12:00:00Z')",
      [deviceId],
    );

    await applyMigration();

    const { rows } = await client.query(
      "select device_id, last_pushed_at, last_accepted_push_at from device_state",
    );
    expect(rows).toEqual([
      {
        device_id: deviceId,
        last_pushed_at: new Date("2026-10-06T12:00:00Z"),
        last_accepted_push_at: null,
      },
    ]);
  });

  it("takes each installation's last accepted push from the latest event its inbox received", async () => {
    const { client, installation, applyMigration } = await databaseBefore();
    const synced = await installation("Caja 1");
    await client.query(
      "insert into device_state (device_id, last_pushed_at) values ($1, '2026-10-06T12:00:00Z')",
      [synced],
    );
    const receive = (deviceSeq: number, receivedAt: string) =>
      client.query(
        `insert into inbox
           (event_id, device_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
            payload, occurred_at, actor_id, chain_hmac, received_at)
         values (gen_random_uuid(), $1, $2, 'Sale', 'sale-1', 'sale_opened', 1, '{}', $3, 'user-1', 'link', $3)`,
        [synced, deviceSeq, receivedAt],
      );
    await receive(1, "2026-10-06T09:00:00Z");
    await receive(2, "2026-10-06T11:20:00Z");

    await applyMigration();

    const { rows } = await client.query(
      "select device_id, last_pushed_at, last_accepted_push_at from device_state",
    );
    expect(rows).toEqual([
      {
        device_id: synced,
        last_pushed_at: new Date("2026-10-06T12:00:00Z"),
        last_accepted_push_at: new Date("2026-10-06T11:20:00Z"),
      },
    ]);
  });

  it("records the last accepted push of an installation whose events were received before it had a device state", async () => {
    const { client, installation, applyMigration } = await databaseBefore();
    const deviceId = await installation("Caja 1");
    await client.query(
      `insert into inbox
         (event_id, device_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
          payload, occurred_at, actor_id, chain_hmac, received_at)
       values (gen_random_uuid(), $1, 1, 'Sale', 'sale-1', 'sale_opened', 1, '{}', $2, 'user-1', 'link', $2)`,
      [deviceId, "2026-10-06T09:00:00Z"],
    );

    await applyMigration();

    const { rows } = await client.query(
      "select device_id, last_accepted_push_at from device_state",
    );
    expect(rows).toEqual([
      { device_id: deviceId, last_accepted_push_at: new Date("2026-10-06T09:00:00Z") },
    ]);
  });
});
