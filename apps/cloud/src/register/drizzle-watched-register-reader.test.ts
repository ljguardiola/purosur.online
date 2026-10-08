import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deviceState, registers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleWatchedRegisterReader } from "./drizzle-watched-register-reader.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

const NOW = new Date("2026-10-05T15:00:00.000Z");
const EARLIER = new Date("2026-10-05T14:00:00.000Z");
const EARLIEST = new Date("2026-10-05T13:00:00.000Z");

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

async function watchedRegisters() {
  return new DrizzleWatchedRegisterReader(db).watchedRegisters();
}

describe("DrizzleWatchedRegisterReader", () => {
  it("lists a register whose installation reports on every sync cycle, with its installation, its branch and its last successful sync", async () => {
    const enrolled = await insertEnrolledInstallation(db, { now: NOW });
    await db.insert(deviceState).values({
      deviceId: enrolled.deviceId,
      lastAcceptedPushAt: EARLIER,
      reportsEveryCycleSince: EARLIEST,
    });

    expect(await watchedRegisters()).toEqual([
      {
        registerId: enrolled.registerId,
        deviceId: enrolled.deviceId,
        locationId: enrolled.locationId,
        lastSuccessfulSyncAt: EARLIER,
      },
    ]);
  });

  it("lists nothing for an installation never known to report on every sync cycle, with or without a device state", async () => {
    await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const pushesOnlyWithEvents = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 2",
    });
    await db
      .insert(deviceState)
      .values({ deviceId: pushesOnlyWithEvents.deviceId, lastAcceptedPushAt: EARLIER });

    expect(await watchedRegisters()).toEqual([]);
  });

  it("lists nothing for a register whose only installation the cloud revoked, even one that reported on every sync cycle", async () => {
    const revoked = await insertEnrolledInstallation(db, { now: NOW, revokedAt: EARLIER });
    await db.insert(deviceState).values({
      deviceId: revoked.deviceId,
      lastAcceptedPushAt: EARLIER,
      reportsEveryCycleSince: EARLIEST,
    });

    expect(await watchedRegisters()).toEqual([]);
  });

  it("lists a replaced register by its current installation, with the latest sync of any installation it has had", async () => {
    const replaced = await insertEnrolledInstallation(db, { now: NOW, revokedAt: EARLIER });
    const current = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: replaced.registerId,
    });
    await db.insert(deviceState).values([
      { deviceId: replaced.deviceId, lastAcceptedPushAt: NOW },
      { deviceId: current.deviceId, lastAcceptedPushAt: EARLIER, reportsEveryCycleSince: EARLIEST },
    ]);

    expect(await watchedRegisters()).toEqual([
      expect.objectContaining({ deviceId: current.deviceId, lastSuccessfulSyncAt: NOW }),
    ]);
  });

  it("gives each register only the syncs of its own installations", async () => {
    const first = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await db.insert(deviceState).values([
      { deviceId: first.deviceId, lastAcceptedPushAt: EARLIER, reportsEveryCycleSince: EARLIEST },
      { deviceId: second.deviceId, lastAcceptedPushAt: NOW, reportsEveryCycleSince: EARLIEST },
    ]);

    const listed = await watchedRegisters();

    expect(
      listed.map(({ registerId, lastSuccessfulSyncAt }) => [registerId, lastSuccessfulSyncAt]),
    ).toEqual(
      expect.arrayContaining([
        [first.registerId, EARLIER],
        [second.registerId, NOW],
      ]),
    );
    expect(listed).toHaveLength(2);
  });

  it("lists nothing for a register that has no installation yet", async () => {
    const enrolled = await insertEnrolledInstallation(db, { now: NOW, revokedAt: EARLIER });
    await db.insert(registers).values({ locationId: enrolled.locationId, name: "Caja 2" });

    expect(await watchedRegisters()).toEqual([]);
  });
});
