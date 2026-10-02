import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { passkeys, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { drizzlePasskeys } from "./drizzle-passkeys.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let branch: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  branch = await seededLocationId(db);
});

async function insertUser(email: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ana", email, locationId: branch })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  return user.id;
}

async function insertPasskey(
  userId: string,
  credentialId: string,
  name: string,
  createdAt: Date,
  lastUsedAt: Date | null = null,
  transports: string[] | null = null,
): Promise<string> {
  const [passkey] = await db
    .insert(passkeys)
    .values({
      userId,
      credentialId,
      publicKey: "public-key",
      counter: 0,
      transports,
      deviceType: "singleDevice",
      backedUp: false,
      name,
      createdAt,
      lastUsedAt,
    })
    .returning({ id: passkeys.id });
  if (!passkey) {
    throw new Error("test setup: seeding the passkey returned no row");
  }
  return passkey.id;
}

describe("drizzlePasskeys", () => {
  describe("passkeySummaries", () => {
    it("answers the passkeys of the user from the oldest, with when each was last used", async () => {
      const userId = await insertUser("ana@example.test");
      const newerId = await insertPasskey(
        userId,
        "c-2",
        "Nueva",
        new Date("2026-10-02T08:00:00.000Z"),
      );
      const olderId = await insertPasskey(
        userId,
        "c-1",
        "Vieja",
        new Date("2026-10-01T08:00:00.000Z"),
        new Date("2026-10-03T08:00:00.000Z"),
      );

      expect(await drizzlePasskeys(db).passkeySummaries(userId)).toEqual([
        {
          id: olderId,
          name: "Vieja",
          createdAt: new Date("2026-10-01T08:00:00.000Z"),
          lastUsedAt: new Date("2026-10-03T08:00:00.000Z"),
        },
        {
          id: newerId,
          name: "Nueva",
          createdAt: new Date("2026-10-02T08:00:00.000Z"),
          lastUsedAt: null,
        },
      ]);
    });

    it("leaves out the passkeys of other users", async () => {
      const userId = await insertUser("ana@example.test");
      const otherId = await insertUser("beto@example.test");
      await insertPasskey(otherId, "c-1", "Ajena", new Date("2026-10-01T08:00:00.000Z"));

      expect(await drizzlePasskeys(db).passkeySummaries(userId)).toEqual([]);
    });
  });

  describe("registeredCredentials", () => {
    it("answers the credential ids and transports of the user's passkeys", async () => {
      const userId = await insertUser("ana@example.test");
      const otherId = await insertUser("beto@example.test");
      const createdAt = new Date("2026-10-01T08:00:00.000Z");
      await insertPasskey(userId, "c-1", "Una", createdAt, null, ["internal", "hybrid"]);
      await insertPasskey(userId, "c-2", "Otra", createdAt);
      await insertPasskey(otherId, "c-3", "Ajena", createdAt);

      const credentials = await drizzlePasskeys(db).registeredCredentials(userId);

      expect(credentials).toHaveLength(2);
      expect(credentials).toEqual(
        expect.arrayContaining([
          { credentialId: "c-1", transports: ["internal", "hybrid"] },
          { credentialId: "c-2", transports: null },
        ]),
      );
    });
  });
});
