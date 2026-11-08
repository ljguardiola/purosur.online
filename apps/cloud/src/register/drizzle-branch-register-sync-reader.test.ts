import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deviceState, locations, registers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBranchRegisterSyncReader } from "./drizzle-branch-register-sync-reader.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const EARLIER = new Date("2026-09-29T09:00:00.000Z");

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

async function recordAcceptedPush(deviceId: string, at: Date | null): Promise<void> {
  await db.insert(deviceState).values({ deviceId, lastAcceptedPushAt: at });
}

describe("DrizzleBranchRegisterSyncReader", () => {
  it("lists the branch's registers by name, with the moment of their last accepted push", async () => {
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const first = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    await recordAcceptedPush(second.deviceId, EARLIER);
    await recordAcceptedPush(first.deviceId, NOW);

    const listed = await new DrizzleBranchRegisterSyncReader(
      db,
    ).lastSuccessfulSyncOfBranchRegisters(first.locationId);

    expect(listed).toEqual([
      expect.objectContaining({ id: first.registerId, name: "Caja 1", lastSuccessfulSyncAt: NOW }),
      expect.objectContaining({
        id: second.registerId,
        name: "Caja 2",
        lastSuccessfulSyncAt: EARLIER,
      }),
    ]);
  });

  it("answers no moment for a register that never had a push accepted, with or without a device state", async () => {
    const neverPushed = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const refusedOnly = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await recordAcceptedPush(refusedOnly.deviceId, null);

    const listed = await new DrizzleBranchRegisterSyncReader(
      db,
    ).lastSuccessfulSyncOfBranchRegisters(neverPushed.locationId);

    expect(listed.map((register) => register.lastSuccessfulSyncAt)).toEqual([null, null]);
  });

  it("answers no moment for a register that has no installation yet", async () => {
    const enrolled = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    await db.insert(registers).values({
      locationId: enrolled.locationId,
      name: "Caja 2",
    });

    const listed = await new DrizzleBranchRegisterSyncReader(
      db,
    ).lastSuccessfulSyncOfBranchRegisters(enrolled.locationId);

    expect(listed.map((register) => register.name)).toEqual(["Caja 1", "Caja 2"]);
    expect(listed[1]?.lastSuccessfulSyncAt).toBeNull();
  });

  it("answers the latest accepted push among every installation the register has had", async () => {
    const replaced = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 1",
      revokedAt: EARLIER,
    });
    const current = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: replaced.registerId,
    });
    await recordAcceptedPush(replaced.deviceId, NOW);
    await recordAcceptedPush(current.deviceId, EARLIER);

    const listed = await new DrizzleBranchRegisterSyncReader(
      db,
    ).lastSuccessfulSyncOfBranchRegisters(replaced.locationId);

    expect(listed).toEqual([
      expect.objectContaining({
        id: replaced.registerId,
        name: "Caja 1",
        lastSuccessfulSyncAt: NOW,
      }),
    ]);
  });

  it("answers the battery and disk a register reported when it synced", async () => {
    const installation = await insertEnrolledInstallation(db, { now: NOW });
    await db.insert(deviceState).values({
      deviceId: installation.deviceId,
      lastAcceptedPushAt: NOW,
      batteryPresent: true,
      batteryChargePercent: 64,
      batteryHealthPercent: 55,
      batteryOnBattery: true,
      batteryOnBatteryMinutes: 14,
      diskFreeBytes: 105_226_698_752,
      diskFreeRatio: 0.41,
    });

    const [listed] = await new DrizzleBranchRegisterSyncReader(
      db,
    ).lastSuccessfulSyncOfBranchRegisters(installation.locationId);

    expect(listed?.battery).toEqual({
      present: true,
      chargePercent: 64,
      healthPercent: 55,
      onBattery: true,
      onBatteryMinutes: 14,
    });
    expect(listed?.disk).toEqual({ freeBytes: 105_226_698_752, freeRatio: 0.41 });
  });

  it("answers a battery without a reported health and one that is on mains power", async () => {
    const installation = await insertEnrolledInstallation(db, { now: NOW });
    await db.insert(deviceState).values({
      deviceId: installation.deviceId,
      lastAcceptedPushAt: NOW,
      batteryPresent: true,
      batteryChargePercent: 87,
      batteryHealthPercent: null,
      batteryOnBattery: false,
      batteryOnBatteryMinutes: 0,
    });

    const [listed] = await new DrizzleBranchRegisterSyncReader(
      db,
    ).lastSuccessfulSyncOfBranchRegisters(installation.locationId);

    expect(listed?.battery).toEqual({
      present: true,
      chargePercent: 87,
      healthPercent: null,
      onBattery: false,
      onBatteryMinutes: 0,
    });
  });

  it("answers that a register has no battery when it reported none", async () => {
    const installation = await insertEnrolledInstallation(db, { now: NOW });
    await db.insert(deviceState).values({
      deviceId: installation.deviceId,
      lastAcceptedPushAt: NOW,
      batteryPresent: false,
    });

    const [listed] = await new DrizzleBranchRegisterSyncReader(
      db,
    ).lastSuccessfulSyncOfBranchRegisters(installation.locationId);

    expect(listed?.battery).toEqual({ present: false });
  });

  it("answers no battery and no disk for a register that never reported them", async () => {
    const reportedNothing = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 1",
    });
    await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await recordAcceptedPush(reportedNothing.deviceId, NOW);

    const listed = await new DrizzleBranchRegisterSyncReader(
      db,
    ).lastSuccessfulSyncOfBranchRegisters(reportedNothing.locationId);

    expect(listed.map(({ battery, disk }) => ({ battery, disk }))).toEqual([
      { battery: null, disk: null },
      { battery: null, disk: null },
    ]);
  });

  it("answers the battery and disk of the installation that synced last, not of another installation of the register", async () => {
    const replaced = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 1",
      revokedAt: EARLIER,
    });
    const current = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: replaced.registerId,
    });
    await db.insert(deviceState).values({
      deviceId: replaced.deviceId,
      lastAcceptedPushAt: EARLIER,
      batteryPresent: false,
      diskFreeBytes: 1,
      diskFreeRatio: 0.01,
    });
    await db.insert(deviceState).values({
      deviceId: current.deviceId,
      lastAcceptedPushAt: NOW,
      batteryPresent: true,
      batteryChargePercent: 90,
      batteryOnBattery: false,
      batteryOnBatteryMinutes: 0,
      diskFreeBytes: 2_000_000_000,
      diskFreeRatio: 0.5,
    });

    const [listed] = await new DrizzleBranchRegisterSyncReader(
      db,
    ).lastSuccessfulSyncOfBranchRegisters(replaced.locationId);

    expect(listed?.battery).toMatchObject({ present: true, chargePercent: 90 });
    expect(listed?.disk).toEqual({ freeBytes: 2_000_000_000, freeRatio: 0.5 });
  });

  it("lists no register of another branch", async () => {
    await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }

    const listed = await new DrizzleBranchRegisterSyncReader(
      db,
    ).lastSuccessfulSyncOfBranchRegisters(otherLocation.id);

    expect(listed).toEqual([]);
  });

  it("lists the branch's registers with numbers by value, case and accents ignored and ñ after n", async () => {
    const locationId = await seededLocationId(db);
    await db
      .insert(registers)
      .values(
        ["Zoe", "Caja 10", "ñandú", "Banco", "oso", "árbol", "Caja 2", "ana", "nube"].map(
          (name) => ({ locationId, name }),
        ),
      );

    const listed = await new DrizzleBranchRegisterSyncReader(
      db,
    ).lastSuccessfulSyncOfBranchRegisters(locationId);

    expect(listed.map((register) => register.name)).toEqual([
      "ana",
      "árbol",
      "Banco",
      "Caja 2",
      "Caja 10",
      "nube",
      "ñandú",
      "oso",
      "Zoe",
    ]);
  });

  it("lists the branch's registers whose names order the same in the order of their ids", async () => {
    const locationId = await seededLocationId(db);
    await db.insert(registers).values([
      { id: "00000000-0000-4000-8000-00000000000b", locationId, name: "Caja 1" },
      { id: "00000000-0000-4000-8000-00000000000a", locationId, name: "Caja 01" },
    ]);

    const listed = await new DrizzleBranchRegisterSyncReader(
      db,
    ).lastSuccessfulSyncOfBranchRegisters(locationId);

    expect(listed.map((register) => register.id)).toEqual([
      "00000000-0000-4000-8000-00000000000a",
      "00000000-0000-4000-8000-00000000000b",
    ]);
  });
});
