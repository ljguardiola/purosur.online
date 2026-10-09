import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { passkeys, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { drizzleAccounts } from "./drizzle-accounts.js";

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

async function insertUser(active = true): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ana", email: "ana@example.test", locationId: branch, active })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  return user.id;
}

async function insertPasskey(userId: string, transports: string[] | null): Promise<string> {
  const [passkey] = await db
    .insert(passkeys)
    .values({
      userId,
      credentialId: "credential-1",
      publicKey: "public-key",
      counter: 4,
      transports,
      deviceType: "singleDevice",
      backedUp: false,
      name: "Llave",
    })
    .returning({ id: passkeys.id });
  if (!passkey) {
    throw new Error("test setup: seeding the passkey returned no row");
  }
  return passkey.id;
}

describe("drizzleAccounts", () => {
  describe("profile", () => {
    it("answers the name and email of the account", async () => {
      const userId = await insertUser();

      expect(await drizzleAccounts(db).profile(userId)).toEqual({
        firstName: "Ana",
        email: "ana@example.test",
      });
    });

    it("answers a deactivated account as it is stored", async () => {
      const userId = await insertUser(false);

      expect(await drizzleAccounts(db).profile(userId)).toEqual({
        firstName: "Ana",
        email: "ana@example.test",
      });
    });

    it("answers nothing for an unknown account", async () => {
      expect(
        await drizzleAccounts(db).profile("6f1b1c7e-0000-4000-8000-0000000000ff"),
      ).toBeUndefined();
    });
  });

  describe("signInPasskey", () => {
    it("answers the passkey with whether its user is active", async () => {
      const userId = await insertUser();
      const id = await insertPasskey(userId, ["internal"]);

      expect(await drizzleAccounts(db).signInPasskey("credential-1")).toEqual({
        id,
        userId,
        credentialId: "credential-1",
        publicKey: "public-key",
        counter: 4,
        transports: ["internal"],
        userActive: true,
      });
    });

    it("answers a deactivated user's passkey as inactive", async () => {
      const userId = await insertUser(false);
      await insertPasskey(userId, null);

      expect(await drizzleAccounts(db).signInPasskey("credential-1")).toMatchObject({
        transports: null,
        userActive: false,
      });
    });

    it("answers nothing for an unknown credential", async () => {
      expect(await drizzleAccounts(db).signInPasskey("credential-1")).toBeUndefined();
    });
  });
});
