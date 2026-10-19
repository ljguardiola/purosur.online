import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, changes, locations, userPins, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePinResetStore } from "./drizzle-pin-reset-store.js";

const AT = new Date("2026-10-16T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let branchId: string;
let otherBranchId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  const [first, second] = await db.insert(locations).values([{}, {}]).returning({ id: locations.id });
  if (!first || !second) {
    throw new Error("test setup: seeding the branches returned no row");
  }
  branchId = first.id;
  otherBranchId = second.id;
});

async function insertUser(input: {
  firstName: string;
  locationId: string;
  withPin: boolean;
}): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: input.firstName,
      email: `${input.firstName.toLowerCase()}@example.test`,
      locationId: input.locationId,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  if (input.withPin) {
    await db.insert(userPins).values({ userId: user.id, salt: "salt", hash: "hash", setAt: AT });
  }
  return user.id;
}

function reset(actorId: string): Promise<number> {
  return new DrizzlePinResetStore(db, () => AT).transaction((tx) =>
    tx.requirePinResetOfEveryUser(actorId),
  );
}

describe("DrizzlePinResetStore", () => {
  it("removes the PIN of every user of every branch and counts only the users who held one", async () => {
    const admin = await insertUser({ firstName: "Ada", locationId: branchId, withPin: true });
    await insertUser({ firstName: "Bea", locationId: branchId, withPin: true });
    await insertUser({ firstName: "Caro", locationId: branchId, withPin: false });
    await insertUser({ firstName: "Dora", locationId: otherBranchId, withPin: true });

    const removed = await reset(admin);

    expect(removed).toBe(3);
    expect(await db.select().from(userPins)).toEqual([]);
  });

  it("raises the version of each reset user and notes it in the change feed of the user's branch", async () => {
    const admin = await insertUser({ firstName: "Ada", locationId: branchId, withPin: true });
    const elsewhere = await insertUser({
      firstName: "Dora",
      locationId: otherBranchId,
      withPin: true,
    });
    const withoutPin = await insertUser({
      firstName: "Caro",
      locationId: branchId,
      withPin: false,
    });

    await reset(admin);

    const versions = await db.select({ id: users.id, version: users.version }).from(users);
    expect(versions.find(({ id }) => id === elsewhere)?.version).toBe(2);
    expect(versions.find(({ id }) => id === withoutPin)?.version).toBe(1);
    expect(
      await db
        .select({ entityId: changes.entityId, version: changes.version, locationId: changes.locationId })
        .from(changes)
        .where(eq(changes.entityId, elsewhere)),
    ).toEqual([{ entityId: elsewhere, version: 2, locationId: otherBranchId }]);
  });

  it("audits each reset with its cause and the actor, only for users who held a PIN", async () => {
    const admin = await insertUser({ firstName: "Ada", locationId: branchId, withPin: true });
    const cashier = await insertUser({ firstName: "Bea", locationId: otherBranchId, withPin: true });
    await insertUser({ firstName: "Caro", locationId: branchId, withPin: false });

    await reset(admin);

    const rows = await db
      .select({
        entityId: auditLog.entityId,
        actorId: auditLog.actorId,
        newValue: auditLog.newValue,
        at: auditLog.at,
      })
      .from(auditLog)
      .where(eq(auditLog.entity, "user"));
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          entityId: admin,
          actorId: admin,
          newValue: { pin_reset_required_by: "compromise_response" },
          at: AT,
        },
        {
          entityId: cashier,
          actorId: admin,
          newValue: { pin_reset_required_by: "compromise_response" },
          at: AT,
        },
      ]),
    );
  });

  it("changes nothing when no user holds a PIN", async () => {
    const admin = await insertUser({ firstName: "Ada", locationId: branchId, withPin: false });

    expect(await reset(admin)).toBe(0);
    expect(await db.select().from(auditLog)).toEqual([]);
    expect(await db.select().from(changes).where(eq(changes.entity, "user"))).toEqual([]);
  });
});
