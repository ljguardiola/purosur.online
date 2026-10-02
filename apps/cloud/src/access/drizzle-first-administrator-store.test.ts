import type { FirstAdministratorStoreTransaction } from "@purosur/domain/access/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, roles, userRoles, users } from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFirstAdministratorStore } from "./drizzle-first-administrator-store.js";

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

function inTransaction<TOutcome>(
  work: (tx: FirstAdministratorStoreTransaction) => Promise<TOutcome>,
): Promise<TOutcome> {
  return new DrizzleFirstAdministratorStore(db).transaction(work);
}

describe("DrizzleFirstAdministratorStore", () => {
  it("reports no user while the table is empty and a user once one exists", async () => {
    expect(await inTransaction((tx) => tx.anyUserExists())).toBe(false);
    await db.insert(users).values({
      firstName: "Cashier",
      email: "cashier@example.com",
      locationId: await seededLocationId(db),
    });

    expect(await inTransaction((tx) => tx.anyUserExists())).toBe(true);
  });

  it("finds the seeded Administrator role and the seeded location", async () => {
    const [administrator] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isAdministrator, true));

    expect(await inTransaction((tx) => tx.findAdministratorRole())).toEqual(administrator);
    expect(await inTransaction((tx) => tx.findLocation())).toEqual({
      id: await seededLocationId(db),
    });
  });

  it("inserts the user, logs it as an insert of its first version and returns its id", async () => {
    const locationId = await seededLocationId(db);
    const mark = await lastLoggedChangeSeq(db);

    const created = await inTransaction((tx) =>
      tx.insertUser({ firstName: "Ada", email: "ada@example.com", locationId }),
    );

    const [row] = await db.select().from(users);
    expect(row).toMatchObject({
      id: created.id,
      firstName: "Ada",
      email: "ada@example.com",
      locationId,
    });
    expect(await changesLoggedAfter(db, mark)).toEqual([
      { entity: "user", entityId: created.id, version: 1, op: "insert", locationId },
    ]);
  });

  it("assigns the role and audits the creation with the user as its own actor", async () => {
    const locationId = await seededLocationId(db);
    const [administrator] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isAdministrator, true));
    if (!administrator) {
      throw new Error("test setup: no Administrator role seeded");
    }

    const created = await inTransaction(async (tx) => {
      const user = await tx.insertUser({ firstName: "Ada", email: "ada@example.com", locationId });
      await tx.assignRole(user.id, administrator.id);
      await tx.recordFirstAdministrator(user.id, {
        firstName: "Ada",
        email: "ada@example.com",
        roleId: administrator.id,
      });
      return user;
    });

    expect(await db.select().from(userRoles)).toEqual([
      { userId: created.id, roleId: administrator.id },
    ]);
    const [audit] = await db.select().from(auditLog);
    expect(audit).toMatchObject({
      entity: "user",
      entityId: created.id,
      actorId: created.id,
      previousValue: null,
      newValue: { firstName: "Ada", email: "ada@example.com", roleId: administrator.id },
    });
  });
});
