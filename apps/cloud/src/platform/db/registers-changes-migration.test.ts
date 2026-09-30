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

const OTHER_LOCATION = "00000000-0000-4000-8000-0000000000f1";
const REGISTER_A = "00000000-0000-4000-8000-0000000000c1";
const REGISTER_B = "00000000-0000-4000-8000-0000000000c2";

async function registersChangesEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_registers_changes",
    "test setup: no registers changes migration in the journal",
  );
}

describe("the registers changes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("logs every existing register as an insert at version 1, so the register pulling from the start receives its own", async () => {
    const folder = await mkdtemp(join(tmpdir(), "registers-changes-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await registersChangesEntry());
    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: seededLocations } = await client.query<{ id: string }>(
      "select id from locations",
    );
    const seededLocation = seededLocations[0]?.id;
    await client.query("insert into locations (id) values ($1)", [OTHER_LOCATION]);
    await client.query(
      `insert into registers (id, location_id, name)
       values ($1, $3, 'Caja 2'), ($2, $4, 'Caja 1')`,
      [REGISTER_B, REGISTER_A, OTHER_LOCATION, seededLocation],
    );
    const { rows: before } = await client.query("select entity from changes");

    await addMigrationEntry(folder, await registersChangesEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: logged } = await client.query(
      `select entity, entity_id, version, op, location_id, origin_device_id
       from changes order by change_seq offset $1`,
      [before.length],
    );
    const insert = { entity: "register", version: 1, op: "insert", location_id: null };
    expect(logged).toEqual([
      { ...insert, entity_id: REGISTER_A, origin_device_id: null },
      { ...insert, entity_id: REGISTER_B, origin_device_id: null },
    ]);
  });
});
