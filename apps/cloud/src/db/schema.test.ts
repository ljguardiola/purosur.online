import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  onTestFinished,
} from "vitest";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { buildTestDatabase, type TestDatabase } from "./build-test-database.js";
import {
  categories,
  locations,
  passkeyChallenges,
  priceLists,
  priceReviews,
  prices,
  products,
  roles,
  sessions,
  userRoles,
  users,
} from "./schema.js";
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

describe("price_reviews.price_id", () => {
  it("rejects a review of one product pointing at another product's price", async () => {
    const actor = await insertUser("ada@example.com");
    const [priceList] = await db.select({ id: priceLists.id }).from(priceLists);
    const [category] = await db
      .insert(categories)
      .values({ name: "Almacén" })
      .returning({ id: categories.id });
    if (!priceList || !category) {
      throw new Error(
        "test setup: no price list seeded, or inserting the category returned no row",
      );
    }
    const [rice, noodles] = await db
      .insert(products)
      .values([
        { name: "Arroz", categoryId: category.id, saleUnit: "UNIT" },
        { name: "Fideos", categoryId: category.id, saleUnit: "UNIT" },
      ])
      .returning({ id: products.id });
    if (!rice || !noodles) {
      throw new Error("test setup: inserting the products returned no row");
    }
    const [ricePrice] = await db
      .insert(prices)
      .values({ productId: rice.id, priceListId: priceList.id, unitPrice: 1000 })
      .returning({ id: prices.id });
    if (!ricePrice) {
      throw new Error("test setup: inserting the price returned no row");
    }

    await expect(
      db.insert(priceReviews).values({
        productId: noodles.id,
        priceListId: priceList.id,
        actorId: actor.id,
        priceId: ricePrice.id,
      }),
    ).rejects.toMatchObject({ cause: { constraint: "price_reviews_price_product_price_list_fk" } });
  });
});

async function insertSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  const [session] = await db
    .insert(sessions)
    .values({ userId, sessionIdHash: hashSessionId(rawSessionId) })
    .returning({ id: sessions.id });
  if (!session) {
    throw new Error("test setup: inserting the session returned no row");
  }
  return session.id;
}

describe("sessions.passkey_authorized_at", () => {
  it("defaults to null", async () => {
    const user = await insertUser("ada@example.com");
    const sessionId = await insertSession(user.id);

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));

    expect(session?.passkeyAuthorizedAt).toBeNull();
  });

  it("stores the timestamp it is set to", async () => {
    const user = await insertUser("ada@example.com");
    const sessionId = await insertSession(user.id);
    const authorizedAt = new Date("2026-01-05T12:00:00.000Z");

    await db
      .update(sessions)
      .set({ passkeyAuthorizedAt: authorizedAt })
      .where(eq(sessions.id, sessionId));

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(session?.passkeyAuthorizedAt).toEqual(authorizedAt);
  });
});

describe("passkey_challenges.kind", () => {
  it("accepts registration and session_authorization, rejecting a removed kind", async () => {
    const user = await insertUser("ada@example.com");
    const sessionId = await insertSession(user.id);

    await expect(
      db.insert(passkeyChallenges).values({
        sessionId,
        kind: "role_creation" as unknown as "registration",
        registrationChallenge: "a-registration-challenge",
      }),
    ).rejects.toBeTruthy();

    await db.insert(passkeyChallenges).values({
      sessionId,
      kind: "session_authorization",
      reauthenticationChallenge: "an-assertion-challenge",
    });
    const [stored] = await db
      .select()
      .from(passkeyChallenges)
      .where(eq(passkeyChallenges.sessionId, sessionId));
    expect(stored).toMatchObject({ kind: "session_authorization" });
  });
});

describe("migrating a database with a pending passkey challenge of a removed kind", () => {
  async function migrationsFolderThrough0018(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "migrations-through-0018-"));
    onTestFinished(() => rm(folder, { recursive: true, force: true }));
    await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      entries: { idx: number; tag: string }[];
    };
    const laterEntries = journal.entries.filter((entry) => entry.idx > 18);
    for (const entry of laterEntries) {
      await rm(join(folder, `${entry.tag}.sql`));
      await rm(join(folder, "meta", `${String(entry.idx).padStart(4, "0")}_snapshot.json`));
    }
    journal.entries = journal.entries.filter((entry) => entry.idx <= 18);
    await writeFile(journalPath, JSON.stringify(journal, null, 2));
    return folder;
  }

  async function sessionOnDatabaseThrough0018() {
    const priorMigrationsFolder = await migrationsFolderThrough0018();
    const client = await migrateFreshDatabase(
      priorMigrationsFolder,
      inject("testDatabaseClusterDumpPath"),
    );
    onTestFinished(() => client.close());
    const { rows: userRows } = await client.query<{ id: string }>(
      `insert into "users" ("first_name", "email", "location_id") values ('Ada', 'ada@example.com', (select id from locations limit 1)) returning "id"`,
    );
    const userId = userRows[0]?.id;
    const { rows: sessionRows } = await client.query<{ id: string }>(
      `insert into "sessions" ("user_id", "session_id_hash") values ('${userId}', 'a-session-hash') returning "id"`,
    );
    return { client, sessionId: sessionRows[0]?.id };
  }

  it("deletes a pending registration issued before passkey registration required an authorization", async () => {
    const { client, sessionId } = await sessionOnDatabaseThrough0018();
    await client.query(
      `insert into "passkey_challenges" ("session_id", "kind", "reauthentication_challenge", "registration_challenge") values ('${sessionId}', 'registration', 'a-stale-reauthentication', 'a-stale-registration')`,
    );

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });

    const { rows: remaining } = await client.query(
      `select * from "passkey_challenges" where "session_id" = '${sessionId}'`,
    );
    expect(remaining).toHaveLength(0);
  });

  it("deletes the pending row instead of leaving a kind the new enum no longer has", async () => {
    const { client, sessionId } = await sessionOnDatabaseThrough0018();
    await client.query(
      `insert into "passkey_challenges" ("session_id", "kind", "reauthentication_challenge") values ('${sessionId}', 'role_creation', 'a-stale-challenge')`,
    );

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });

    const { rows: remaining } = await client.query(
      `select * from "passkey_challenges" where "session_id" = '${sessionId}'`,
    );
    expect(remaining).toHaveLength(0);
    const { rows: enumValues } = await client.query<{ enumlabel: string }>(
      `select enumlabel from pg_enum join pg_type on pg_enum.enumtypid = pg_type.oid where pg_type.typname = 'passkey_management_challenge_kind' order by enumsortorder`,
    );
    expect(enumValues.map((row) => row.enumlabel)).toEqual([
      "registration",
      "session_authorization",
    ]);
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
    const client = await migrateFreshDatabase(
      priorMigrationsFolder,
      inject("testDatabaseClusterDumpPath"),
    );
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
