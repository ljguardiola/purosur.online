import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished } from "vitest";
import { buildTestDatabase, type TestDatabase } from "./build-test-database.js";
import { locations, roles, userRoles, users } from "./schema.js";
import { MIGRATIONS_FOLDER, migrateFreshDatabase } from "./test-database-snapshot.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function insertUser(email: string): Promise<{ id: string }> {
  const [location] = await db.select({ id: locations.id }).from(locations);
  if (!location) {
    throw new Error("test setup: no location seeded");
  }
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada", email, locationId: location.id })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  return user;
}

describe("locations", () => {
  it("is seeded with exactly one row, the business's single branch", async () => {
    const seededLocations = await db.select().from(locations);

    expect(seededLocations).toHaveLength(1);
  });
});

describe("users.location_id", () => {
  it("rejects a user row with no location", async () => {
    await expect(
      db.execute(
        sql`insert into "users" ("first_name", "email") values ('Ada', 'ada@example.com')`,
      ),
    ).rejects.toMatchObject({ cause: { column: "location_id" } });
  });
});

describe("user_roles", () => {
  it("rejects a second role for a user that already holds one", async () => {
    const user = await insertUser("ada@example.com");
    const [cashierRole] = await db
      .insert(roles)
      .values({ name: "Cashier", isAdministrator: false })
      .returning({ id: roles.id });
    const [managerRole] = await db
      .insert(roles)
      .values({ name: "Manager", isAdministrator: false })
      .returning({ id: roles.id });
    if (!cashierRole || !managerRole) {
      throw new Error("test setup: inserting a role returned no row");
    }
    await db.insert(userRoles).values({ userId: user.id, roleId: cashierRole.id });

    await expect(
      db.insert(userRoles).values({ userId: user.id, roleId: managerRole.id }),
    ).rejects.toMatchObject({ cause: { constraint: "user_roles_user_id_key" } });
  });
});

describe("migrating a database that already has users", () => {
  // Drops the `0011_locations` migration and every migration after it (not just that one), so a
  // migration added later still leaves this folder ending exactly where locations did not exist
  // yet, instead of applying a later migration out of order while 0011 itself stays missing.
  async function migrationsFolderWithoutLocations(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "migrations-without-locations-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      entries: { idx: number; tag: string }[];
    };
    const locationsEntry = journal.entries.find((entry) => entry.tag === "0011_locations");
    if (!locationsEntry) {
      throw new Error("test setup: 0011_locations migration not found in the journal");
    }
    const droppedEntries = journal.entries.filter((entry) => entry.idx >= locationsEntry.idx);
    for (const entry of droppedEntries) {
      await rm(join(folder, `${entry.tag}.sql`));
      await rm(join(folder, "meta", `${String(entry.idx).padStart(4, "0")}_snapshot.json`));
    }
    journal.entries = journal.entries.filter((entry) => entry.idx < locationsEntry.idx);
    await writeFile(journalPath, JSON.stringify(journal, null, 2));
    return folder;
  }

  it("backfills every existing user onto the seeded location", async () => {
    const priorMigrationsFolder = await migrationsFolderWithoutLocations();
    const client = await migrateFreshDatabase(priorMigrationsFolder);
    onTestFinished(() => client.close());
    await client.query(
      `insert into "users" ("first_name", "email") values ('Ada', 'ada@example.com')`,
    );

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });

    const { rows: locationRows } = await client.query<{ id: string }>(
      `select "id" from "locations"`,
    );
    const { rows: userRows } = await client.query<{ location_id: string }>(
      `select "location_id" from "users"`,
    );
    expect(locationRows).toHaveLength(1);
    expect(userRows).toEqual([{ location_id: locationRows[0]?.id }]);
  });
});
