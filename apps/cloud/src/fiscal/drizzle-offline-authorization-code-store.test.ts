import type { KeptOfflineAuthorizationCode } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caeaCodes, changes } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const OCTOBER_SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };

const KEPT: KeptOfflineAuthorizationCode = {
  code: {
    code: "21403471111111",
    fortnight: OCTOBER_FIRST_HALF,
    reportDeadline: "2026-10-30",
  },
  obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
  obtainedThrough: "requested",
};

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

function newStore() {
  return new DrizzleOfflineAuthorizationCodeStore(db);
}

describe("DrizzleOfflineAuthorizationCodeStore", () => {
  it("finds no offline point of sale while no register has one", async () => {
    expect(await newStore().hasOfflinePointOfSale()).toBe(false);
  });

  it("finds an offline point of sale once a register has one", async () => {
    await seedOfflinePointOfSale(db);

    expect(await newStore().hasOfflinePointOfSale()).toBe(true);
  });

  it("holds no code for a fortnight before one is kept", async () => {
    const held = await newStore().holdAcquisition(OCTOBER_FIRST_HALF, (acquisition) =>
      acquisition.isHeld(),
    );

    expect(held).toBe(false);
  });

  it("keeps the code with the fortnight, deadline, moment and way it was obtained", async () => {
    await newStore().holdAcquisition(OCTOBER_FIRST_HALF, (acquisition) => acquisition.keep(KEPT));

    expect(await db.select().from(caeaCodes)).toEqual([
      {
        id: expect.any(String),
        fortnightStart: "2026-10-01",
        fortnightEnd: "2026-10-15",
        code: "21403471111111",
        reportDeadline: "2026-10-30",
        obtainedAt: KEPT.obtainedAt,
        obtainedThrough: "requested",
      },
    ]);
  });

  it("logs the code it keeps as a change of its own identity at version 1, for every register", async () => {
    await newStore().holdAcquisition(OCTOBER_FIRST_HALF, (acquisition) => acquisition.keep(KEPT));

    const [kept] = await db.select().from(caeaCodes);
    const logged = await db
      .select({
        entity: changes.entity,
        entityId: changes.entityId,
        version: changes.version,
        op: changes.op,
        locationId: changes.locationId,
        registerId: changes.registerId,
      })
      .from(changes);
    expect(logged).toEqual([
      {
        entity: "offline_authorization_code",
        entityId: kept?.id,
        version: 1,
        op: "insert",
        locationId: null,
        registerId: null,
      },
    ]);
  });

  it("keeps and logs nothing of a code whose fortnight is already held", async () => {
    await newStore().holdAcquisition(OCTOBER_FIRST_HALF, (acquisition) => acquisition.keep(KEPT));

    await expect(
      newStore().holdAcquisition(OCTOBER_FIRST_HALF, (acquisition) => acquisition.keep(KEPT)),
    ).rejects.toThrow();

    expect(await db.select().from(caeaCodes)).toHaveLength(1);
    expect(await db.select().from(changes)).toHaveLength(1);
  });

  it("holds the code of a fortnight once kept, and no code for the next fortnight", async () => {
    await newStore().holdAcquisition(OCTOBER_FIRST_HALF, (acquisition) => acquisition.keep(KEPT));

    const store = newStore();
    expect(
      await store.holdAcquisition(OCTOBER_FIRST_HALF, (acquisition) => acquisition.isHeld()),
    ).toBe(true);
    expect(
      await store.holdAcquisition(OCTOBER_SECOND_HALF, (acquisition) => acquisition.isHeld()),
    ).toBe(false);
  });

  it("keeps a code found again at ARCA as recovered", async () => {
    await newStore().holdAcquisition(OCTOBER_FIRST_HALF, (acquisition) =>
      acquisition.keep({ ...KEPT, obtainedThrough: "recovered" }),
    );

    expect(await db.select({ through: caeaCodes.obtainedThrough }).from(caeaCodes)).toEqual([
      { through: "recovered" },
    ]);
  });

  it("returns what the work returns", async () => {
    expect(await newStore().holdAcquisition(OCTOBER_FIRST_HALF, async () => "worked")).toBe(
      "worked",
    );
  });
});
