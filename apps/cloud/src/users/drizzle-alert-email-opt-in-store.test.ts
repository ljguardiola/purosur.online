import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, auditLog, changes, locations, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleAlertEmailOptInStore } from "./drizzle-alert-email-opt-in-store.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let branch: string;

const NOW = new Date("2026-10-01T12:00:00.000Z");
const EARLIER = new Date("2026-09-01T10:00:00.000Z");

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

const store = () => new DrizzleAlertEmailOptInStore(db, () => NOW);

async function insertUser(
  input: { locationId?: string; active?: boolean; alertEmailOptedInAt?: Date | null } = {},
): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      firstName: "Ada",
      email: `ada-${crypto.randomUUID()}@example.com`,
      locationId: input.locationId ?? branch,
      active: input.active ?? true,
      alertEmailOptedInAt: input.alertEmailOptedInAt ?? null,
    })
    .returning({ id: users.id });
  if (!row) {
    throw new Error("test setup: seeding a user returned no row");
  }
  return row.id;
}

async function otherBranch(): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the location returned no row");
  }
  return location.id;
}

async function storedOptIn(userId: string) {
  const [row] = await db
    .select({ at: users.alertEmailOptedInAt, version: users.version })
    .from(users)
    .where(eq(users.id, userId));
  return row;
}

describe("locking a user's opt-in", () => {
  it("answers the moment the active user of the branch opted in, or none", async () => {
    const opted = await insertUser({ alertEmailOptedInAt: EARLIER });
    const notOpted = await insertUser();

    const answers = await store().transaction(async (tx) => [
      await tx.lockBranchUserOptIn(opted, branch),
      await tx.lockBranchUserOptIn(notOpted, branch),
    ]);

    expect(answers).toEqual([{ optedInAt: EARLIER }, { optedInAt: null }]);
  });

  it("finds no user of another branch, no deactivated user and no unknown id", async () => {
    const elsewhere = await insertUser({ locationId: await otherBranch() });
    const deactivated = await insertUser({ active: false });

    const answers = await store().transaction(async (tx) => [
      await tx.lockBranchUserOptIn(elsewhere, branch),
      await tx.lockBranchUserOptIn(deactivated, branch),
      await tx.lockBranchUserOptIn(crypto.randomUUID(), branch),
    ]);

    expect(answers).toEqual([undefined, undefined, undefined]);
  });
});

describe("recording and clearing the opt-in", () => {
  it("stores the moment of the opt-in without touching the user's version or logging a change for registers", async () => {
    const userId = await insertUser();
    const changesBefore = (await db.select().from(changes)).length;

    await store().transaction((tx) => tx.recordOptIn(userId, NOW));

    expect(await storedOptIn(userId)).toEqual({ at: NOW, version: 1 });
    expect(await db.select().from(changes)).toHaveLength(changesBefore);
  });

  it("clears the opt-in without touching the user's version", async () => {
    const userId = await insertUser({ alertEmailOptedInAt: EARLIER });

    await store().transaction((tx) => tx.clearOptIn(userId));

    expect(await storedOptIn(userId)).toEqual({ at: null, version: 1 });
  });

  it("changes only the given user", async () => {
    const userId = await insertUser();
    const other = await insertUser({ alertEmailOptedInAt: EARLIER });

    await store().transaction(async (tx) => {
      await tx.recordOptIn(userId, NOW);
      await tx.clearOptIn(crypto.randomUUID());
    });

    expect((await storedOptIn(other))?.at).toEqual(EARLIER);
  });
});

describe("recording what changed", () => {
  it("writes the user's audit row with the actor, the previous and the new value", async () => {
    const userId = await insertUser();
    const actorId = await insertUser();

    await store().transaction((tx) =>
      tx.recordUserChange(userId, actorId, { kind: "alert_email_opted_in", optedInAt: NOW }),
    );

    const rows = await db.select().from(auditLog).orderBy(asc(auditLog.id));
    expect(rows).toMatchObject([
      {
        entity: "user",
        entityId: userId,
        actorId,
        previousValue: { alertEmailOptedInAt: null },
        newValue: { alertEmailOptedInAt: "2026-10-01T12:00:00.000Z" },
        at: NOW,
      },
    ]);
  });
});

describe("opening the changed recipient set alert", () => {
  it("opens the alert scoped to the user with who changed it and in which direction", async () => {
    const userId = await insertUser();
    const actorId = await insertUser();

    await store().transaction((tx) =>
      tx.openRecipientsChangedAlert({
        userId,
        change: "withdrawn",
        actorId,
        openedAt: NOW,
      }),
    );

    const [opened] = await db.select().from(alerts);
    expect(opened).toMatchObject({
      kind: "alert_recipients_changed",
      scope: userId,
      level: "warning",
      audience: "all",
      openedAt: NOW,
      detail: { change: "withdrawn", actorId },
    });
  });

  it("opens one alert for each change, never merging them", async () => {
    const userId = await insertUser();

    await store().transaction(async (tx) => {
      await tx.openRecipientsChangedAlert({
        userId,
        change: "opted_in",
        actorId: userId,
        openedAt: NOW,
      });
      await tx.openRecipientsChangedAlert({
        userId,
        change: "withdrawn",
        actorId: userId,
        openedAt: NOW,
      });
    });

    expect(await db.select().from(alerts)).toHaveLength(2);
  });
});

describe("failing", () => {
  it("leaves the opt-in as it was when the transaction fails", async () => {
    const userId = await insertUser();

    await expect(
      store().transaction(async (tx) => {
        await tx.recordOptIn(userId, NOW);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect((await storedOptIn(userId))?.at).toBeNull();
  });
});
