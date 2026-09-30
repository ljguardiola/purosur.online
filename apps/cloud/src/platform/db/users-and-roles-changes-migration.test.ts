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
const USER_A = "00000000-0000-4000-8000-0000000000a1";
const USER_B = "00000000-0000-4000-8000-0000000000a2";
const ROLE_A = "00000000-0000-4000-8000-0000000000b1";
const ROLE_B = "00000000-0000-4000-8000-0000000000b2";

async function usersAndRolesChangesEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_users_and_roles_changes",
    "test setup: no users and roles changes migration in the journal",
  );
}

describe("the users and roles changes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("logs every existing user with its branch and every existing role as an insert, so a register pulling from the start receives them", async () => {
    const folder = await mkdtemp(join(tmpdir(), "users-and-roles-changes-migration-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await migrationsFolderBefore(folder, await usersAndRolesChangesEntry());
    const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
    onTestFinished(() => client.close());

    const { rows: seededLocations } = await client.query<{ id: string }>(
      "select id from locations",
    );
    const seededLocation = seededLocations[0]?.id;
    const { rows: seededRoles } = await client.query<{ id: string }>("select id from roles");
    const administratorRole = seededRoles[0]?.id;
    await client.query("insert into locations (id) values ($1)", [OTHER_LOCATION]);
    await client.query(
      `insert into users (id, first_name, email, location_id, version, active)
       values ($1, 'Grace', 'grace@example.com', $3, 4, false),
              ($2, 'Ada', 'ada@example.com', $4, 1, true)`,
      [USER_B, USER_A, OTHER_LOCATION, seededLocation],
    );
    await client.query(
      "insert into roles (id, name, version) values ($1, 'Cajera', 1), ($2, 'Encargado', 6)",
      [ROLE_B, ROLE_A],
    );
    const { rows: before } = await client.query("select entity from changes");

    await addMigrationEntry(folder, await usersAndRolesChangesEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });

    const { rows: logged } = await client.query(
      `select entity, entity_id, version, op, location_id, origin_device_id
       from changes order by change_seq offset $1`,
      [before.length],
    );
    const insert = { op: "insert", origin_device_id: null };
    expect(logged).toEqual([
      { ...insert, entity: "user", entity_id: USER_A, version: 1, location_id: seededLocation },
      { ...insert, entity: "user", entity_id: USER_B, version: 4, location_id: OTHER_LOCATION },
      ...[
        { id: administratorRole, version: 1 },
        { id: ROLE_A, version: 6 },
        { id: ROLE_B, version: 1 },
      ]
        .sort((first, second) => (first.id ?? "").localeCompare(second.id ?? ""))
        .map(({ id, version }) => ({
          ...insert,
          entity: "role",
          entity_id: id,
          version,
          location_id: null,
        })),
    ]);
  });
});
