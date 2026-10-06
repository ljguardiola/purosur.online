import { PasskeyAlreadyRegistered } from "@purosur/domain/access/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, auditLog, passkeys, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePasskeyRegistrationStore } from "./drizzle-passkey-registration-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let userId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ana",
      email: "ana@example.test",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  userId = user.id;
});

function newPasskey(credentialId = "credential-1") {
  return {
    userId,
    credentialId,
    publicKey: "public-key",
    counter: 3,
    transports: ["internal"],
    deviceType: "multiDevice",
    backedUp: true,
    name: "Llave",
  };
}

describe("DrizzlePasskeyRegistrationStore", () => {
  it("stores the passkey and answers its id and creation moment", async () => {
    const added = await new DrizzlePasskeyRegistrationStore(db, () => AT).transaction((tx) =>
      tx.addPasskey(newPasskey()),
    );

    const [stored] = await db.select().from(passkeys);
    expect(stored).toMatchObject({ ...newPasskey(), id: added.id, lastUsedAt: null });
    expect(added.createdAt).toEqual(stored?.createdAt);
  });

  it("raises PasskeyAlreadyRegistered for a credential another passkey holds", async () => {
    const store = new DrizzlePasskeyRegistrationStore(db, () => AT);
    await store.transaction((tx) => tx.addPasskey(newPasskey()));

    await expect(store.transaction((tx) => tx.addPasskey(newPasskey()))).rejects.toBeInstanceOf(
      PasskeyAlreadyRegistered,
    );
    expect(await db.select().from(passkeys)).toHaveLength(1);
  });

  it("audits the registration with the passkey's identity and kind", async () => {
    const store = new DrizzlePasskeyRegistrationStore(db, () => AT);

    const added = await store.transaction(async (tx) => {
      const passkey = await tx.addPasskey(newPasskey());
      await tx.recordPasskeyRegistered(userId, passkey, newPasskey());
      return passkey;
    });

    expect(await db.select().from(auditLog)).toMatchObject([
      {
        entity: "passkey",
        entityId: added.id,
        actorId: userId,
        previousValue: null,
        newValue: {
          id: added.id,
          name: "Llave",
          credentialId: "credential-1",
          deviceType: "multiDevice",
          backedUp: true,
        },
      },
    ]);
  });

  it("opens a self-registered passkey-changed alert for the user", async () => {
    await new DrizzlePasskeyRegistrationStore(db, () => AT).transaction((tx) =>
      tx.openPasskeyRegisteredAlert({ userId, passkeyName: "Llave", openedAt: AT }),
    );

    expect(await db.select().from(alerts).where(eq(alerts.scope, userId))).toMatchObject([
      {
        kind: "backoffice_passkey_changed",
        detail: { action: "registered", passkeyName: "Llave", actorId: userId, via: "self" },
        openedAt: AT,
      },
    ]);
  });
});
