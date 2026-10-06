import { editBranchSettings } from "@purosur/domain/branch/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { auditLog, branchHours, users } from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBranchSettingsReader } from "./drizzle-branch-settings-reader.js";
import { DrizzleBranchSettingsStore } from "./drizzle-branch-settings-store.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

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

async function insertActor(locationId: string): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Marta Quiroga", email: "marta@example.com", locationId })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

function edit(
  locationId: string,
  actorId: string,
  version: number,
  overrides: Record<string, unknown> = {},
) {
  return editBranchSettings(
    { store: new DrizzleBranchSettingsStore(db, () => NOON) },
    {
      locationId,
      actorId,
      address: "Av. Siempre Viva 742",
      whatsappNumber: "",
      instagramHandle: "",
      mondayHours: [
        { opensAt: "09:00", closesAt: "13:00" },
        { opensAt: "17:00", closesAt: "21:00" },
      ],
      tuesdayHours: [],
      wednesdayHours: [],
      thursdayHours: [],
      fridayHours: [],
      saturdayHours: [],
      sundayHours: [],
      expiringLotAlertDays: 30,
      unreviewedPriceAlertDays: 30,
      goodConditionReturnDays: 15,
      version,
      ...overrides,
    },
  );
}

describe("editing the branch settings through DrizzleBranchSettingsStore", () => {
  it("stores the settings at the next version and replaces the hours", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    await db.insert(branchHours).values({
      locationId,
      dayOfWeek: 3,
      position: 0,
      opensAt: "08:00",
      closesAt: "12:00",
    });

    const outcome = await edit(locationId, actorId, 1);

    expect(outcome.kind).toBe("edited");
    expect(await new DrizzleBranchSettingsReader(db).currentBranchSettings(locationId)).toEqual({
      address: "Av. Siempre Viva 742",
      whatsappNumber: "",
      instagramHandle: "",
      hours: [
        { dayOfWeek: 1, position: 0, opensAt: "09:00", closesAt: "13:00" },
        { dayOfWeek: 1, position: 1, opensAt: "17:00", closesAt: "21:00" },
      ],
      expiringLotAlertDays: 30,
      unreviewedPriceAlertDays: 30,
      goodConditionReturnDays: 15,
      version: 2,
    });
  });

  it("audits the actor with the previous and the new settings in their wire shape", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);

    await edit(locationId, actorId, 1);

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, locationId));
    expect(entry).toMatchObject({
      entity: "branch_settings",
      actorId,
      previousValue: { address: "", version: 1, monday_hours: [] },
      newValue: {
        address: "Av. Siempre Viva 742",
        version: 2,
        monday_hours: [
          { opens_at: "09:00", closes_at: "13:00" },
          { opens_at: "17:00", closes_at: "21:00" },
        ],
      },
    });
  });

  it("logs the new version as a change, and nothing for an unchanged save", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const mark = await lastLoggedChangeSeq(db);

    await edit(locationId, actorId, 1);
    await edit(locationId, actorId, 2);

    expect(await changesLoggedAfter(db, mark)).toEqual([
      {
        entity: "branch_settings",
        entityId: locationId,
        version: 2,
        op: "update",
        locationId: null,
      },
    ]);
  });

  it("fails for a branch with no settings row", async () => {
    const actorId = await insertActor(await seededLocationId(db));

    await expect(edit("00000000-0000-4000-8000-000000000000", actorId, 1)).rejects.toThrow(
      "branch settings missing for location",
    );
  });
});

describe("DrizzleBranchSettingsStore's clock", () => {
  it("is required to build the store", () => {
    expectTypeOf<[PgDatabase<PgQueryResultHKT>]>().not.toExtend<
      ConstructorParameters<typeof DrizzleBranchSettingsStore>
    >();
  });
});
