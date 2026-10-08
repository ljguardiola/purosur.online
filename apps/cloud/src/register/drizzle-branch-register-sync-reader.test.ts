import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deviceState, locations, registers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
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
      { id: first.registerId, name: "Caja 1", lastSuccessfulSyncAt: NOW },
      { id: second.registerId, name: "Caja 2", lastSuccessfulSyncAt: EARLIER },
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
      { id: replaced.registerId, name: "Caja 1", lastSuccessfulSyncAt: NOW },
    ]);
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
});
