import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { caeaCodes, changes, deviceState, registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleOfflineAuthorizationCodeHoldingReader } from "./drizzle-offline-authorization-code-holding-reader.js";
import { configureOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const NOW = new Date("2026-10-12T12:00:00.000Z");
const FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };

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

async function publishCode(fortnight: { start: string; end: string }): Promise<number> {
  const [code] = await db
    .insert(caeaCodes)
    .values({
      fortnightStart: fortnight.start,
      fortnightEnd: fortnight.end,
      code: "21423901234567",
      reportDeadline: "2026-11-05",
      obtainedAt: NOW,
      obtainedThrough: "requested",
    })
    .returning({ id: caeaCodes.id });
  if (!code) throw new Error("test setup: inserting the code returned no row");
  const [change] = await db
    .insert(changes)
    .values({ entity: "offline_authorization_code", entityId: code.id, version: 1, op: "insert" })
    .returning({ changeSeq: changes.changeSeq });
  if (!change) throw new Error("test setup: inserting the change returned no row");
  return change.changeSeq;
}

let registerCounter = 0;

function withOfflinePointOfSale(): Promise<string> {
  registerCounter += 1;
  return configureOfflinePointOfSale(db, {
    registerName: `Caja ${registerCounter}`,
    realTimePointOfSale: registerCounter * 2,
    offlinePointOfSale: registerCounter * 2 + 1,
    now: NOW,
  });
}

async function watchedRegister(lastPullSince: number | null) {
  const registerId = await withOfflinePointOfSale();
  const installation = await insertEnrolledInstallation(db, {
    now: NOW,
    existingRegisterId: registerId,
  });
  if (lastPullSince !== null) {
    await db.insert(deviceState).values({ deviceId: installation.deviceId, lastPullSince });
  }
  return { registerId, deviceId: installation.deviceId };
}

function holdings(fortnights = [FIRST_HALF, SECOND_HALF]) {
  return new DrizzleOfflineAuthorizationCodeHoldingReader(db).registerHoldings(fortnights);
}

describe("DrizzleOfflineAuthorizationCodeHoldingReader registerHoldings", () => {
  it("shows the code as held when the register's last pull reached the change that published it", async () => {
    const changeSeq = await publishCode(FIRST_HALF);
    const register = await watchedRegister(changeSeq);

    await expect(holdings()).resolves.toEqual([
      { ...register, heldFortnightStarts: ["2026-10-01"] },
    ]);
  });

  it("shows the code as held when the register pulled beyond the change that published it", async () => {
    const changeSeq = await publishCode(FIRST_HALF);
    const register = await watchedRegister(changeSeq + 10);

    await expect(holdings()).resolves.toEqual([
      { ...register, heldFortnightStarts: ["2026-10-01"] },
    ]);
  });

  it("shows the code as not held when the register's last pull stopped just before the change that published it", async () => {
    const changeSeq = await publishCode(FIRST_HALF);
    const register = await watchedRegister(changeSeq - 1);

    await expect(holdings()).resolves.toEqual([{ ...register, heldFortnightStarts: [] }]);
  });

  it("shows nothing as held when the cloud holds no code", async () => {
    const register = await watchedRegister(1_000_000);

    await expect(holdings()).resolves.toEqual([{ ...register, heldFortnightStarts: [] }]);
  });

  it("shows nothing as held for a register that never pulled", async () => {
    await publishCode(FIRST_HALF);
    const register = await watchedRegister(null);

    await expect(holdings()).resolves.toEqual([{ ...register, heldFortnightStarts: [] }]);
  });

  it("tells each fortnight's code apart", async () => {
    const firstSeq = await publishCode(FIRST_HALF);
    await publishCode(SECOND_HALF);
    const register = await watchedRegister(firstSeq);

    await expect(holdings()).resolves.toEqual([
      { ...register, heldFortnightStarts: ["2026-10-01"] },
    ]);
  });

  it("leaves out a held code of a fortnight that was not asked about", async () => {
    const changeSeq = await publishCode(FIRST_HALF);
    const register = await watchedRegister(changeSeq);

    await expect(holdings([SECOND_HALF])).resolves.toEqual([
      { ...register, heldFortnightStarts: [] },
    ]);
  });

  it("leaves out a register without an offline point of sale", async () => {
    const changeSeq = await publishCode(FIRST_HALF);
    const [register] = await db
      .insert(registers)
      .values({ locationId: await seededLocationId(db), name: "Caja sin facturación" })
      .returning({ id: registers.id });
    if (!register) throw new Error("test setup: inserting the register returned no row");
    const installation = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: register.id,
    });
    await db
      .insert(deviceState)
      .values({ deviceId: installation.deviceId, lastPullSince: changeSeq });

    await expect(holdings()).resolves.toEqual([]);
  });

  it("leaves out a register whose only installation was revoked, however far it had pulled", async () => {
    const changeSeq = await publishCode(FIRST_HALF);
    const registerId = await withOfflinePointOfSale();
    const revoked = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
      revokedAt: NOW,
    });
    await db.insert(deviceState).values({ deviceId: revoked.deviceId, lastPullSince: changeSeq });

    await expect(holdings()).resolves.toEqual([]);
  });

  it("measures a replaced installation by the active one, not by the revoked one that had pulled further", async () => {
    const changeSeq = await publishCode(FIRST_HALF);
    const registerId = await withOfflinePointOfSale();
    const revoked = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
      revokedAt: NOW,
    });
    await db.insert(deviceState).values({ deviceId: revoked.deviceId, lastPullSince: changeSeq });
    const active = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });

    await expect(holdings()).resolves.toEqual([
      { registerId, deviceId: active.deviceId, heldFortnightStarts: [] },
    ]);
  });

  it("answers each watched register on its own", async () => {
    const changeSeq = await publishCode(FIRST_HALF);
    const holder = await watchedRegister(changeSeq);
    const lagging = await watchedRegister(changeSeq - 1);

    const answered = await holdings();

    expect(answered).toHaveLength(2);
    expect(answered).toEqual(
      expect.arrayContaining([
        { ...holder, heldFortnightStarts: ["2026-10-01"] },
        { ...lagging, heldFortnightStarts: [] },
      ]),
    );
  });
});
