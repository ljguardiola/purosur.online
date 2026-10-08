import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { branchHours, deviceState, locations, registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleInServiceRegisterReader } from "./drizzle-in-service-register-reader.js";

const NOW = new Date("2026-10-05T15:00:00.000Z");
const A_DAY_BEFORE = new Date("2026-10-04T15:00:00.000Z");
const EARLIER = new Date("2026-10-05T14:00:00.000Z");

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

async function inServiceRegisters() {
  return new DrizzleInServiceRegisterReader(db).inServiceRegisters();
}

describe("DrizzleInServiceRegisterReader", () => {
  it("lists a register with its installation, its branch, when it was enrolled and when it last had a push accepted", async () => {
    const enrolled = await insertEnrolledInstallation(db, { now: NOW });
    await db
      .insert(deviceState)
      .values({ deviceId: enrolled.deviceId, lastAcceptedPushAt: EARLIER });

    expect(await inServiceRegisters()).toEqual([
      {
        registerId: enrolled.registerId,
        deviceId: enrolled.deviceId,
        locationId: enrolled.locationId,
        enrolledAt: A_DAY_BEFORE,
        lastAcceptedPushAt: EARLIER,
        hours: [],
      },
    ]);
  });

  it("answers no last accepted push for an installation that never had one, with or without a device state", async () => {
    const withoutState = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const refusedOnly = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await db
      .insert(deviceState)
      .values({ deviceId: refusedOnly.deviceId, lastAcceptedPushAt: null });

    const listed = await inServiceRegisters();

    expect(listed.map((register) => register.lastAcceptedPushAt)).toEqual([null, null]);
    expect(listed.map((register) => register.deviceId).sort()).toEqual(
      [withoutState.deviceId, refusedOnly.deviceId].sort(),
    );
  });

  it("lists the branch hours of the register's own branch as HH:MM ranges by day of week", async () => {
    const enrolled = await insertEnrolledInstallation(db, { now: NOW });
    const [otherBranch] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherBranch) {
      throw new Error("test setup: seeding the other branch returned no row");
    }
    await db.insert(branchHours).values([
      {
        locationId: enrolled.locationId,
        dayOfWeek: 1,
        position: 0,
        opensAt: "09:00",
        closesAt: "13:00",
      },
      {
        locationId: enrolled.locationId,
        dayOfWeek: 1,
        position: 1,
        opensAt: "16:30",
        closesAt: "20:00",
      },
      {
        locationId: enrolled.locationId,
        dayOfWeek: 7,
        position: 0,
        opensAt: "10:00",
        closesAt: "12:00",
      },
      {
        locationId: otherBranch.id,
        dayOfWeek: 2,
        position: 0,
        opensAt: "08:00",
        closesAt: "09:00",
      },
    ]);

    const [listed] = await inServiceRegisters();

    expect(listed?.hours).toEqual(
      expect.arrayContaining([
        { dayOfWeek: 1, opensAt: "09:00", closesAt: "13:00" },
        { dayOfWeek: 1, opensAt: "16:30", closesAt: "20:00" },
        { dayOfWeek: 7, opensAt: "10:00", closesAt: "12:00" },
      ]),
    );
    expect(listed?.hours).toHaveLength(3);
  });

  it("gives each register the hours of its own branch", async () => {
    const first = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const [otherBranch] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherBranch) {
      throw new Error("test setup: seeding the other branch returned no row");
    }
    const [otherRegister] = await db
      .insert(registers)
      .values({ locationId: otherBranch.id, name: "Caja 1" })
      .returning({ id: registers.id });
    if (!otherRegister) {
      throw new Error("test setup: seeding the other register returned no row");
    }
    await insertEnrolledInstallation(db, { now: NOW, existingRegisterId: otherRegister.id });
    await db.insert(branchHours).values([
      {
        locationId: first.locationId,
        dayOfWeek: 1,
        position: 0,
        opensAt: "09:00",
        closesAt: "13:00",
      },
      {
        locationId: otherBranch.id,
        dayOfWeek: 2,
        position: 0,
        opensAt: "08:00",
        closesAt: "09:00",
      },
    ]);

    const listed = await inServiceRegisters();

    expect(
      listed
        .map(({ locationId, hours }) => [locationId, hours.map((range) => range.dayOfWeek)])
        .sort(),
    ).toEqual(
      [
        [first.locationId, [1]],
        [otherBranch.id, [2]],
      ].sort(),
    );
  });

  it("lists nothing for a register whose only installation the cloud revoked", async () => {
    await insertEnrolledInstallation(db, { now: NOW, revokedAt: EARLIER });

    expect(await inServiceRegisters()).toEqual([]);
  });

  it("lists a replaced register by its current installation, with that installation's last accepted push", async () => {
    const replaced = await insertEnrolledInstallation(db, { now: NOW, revokedAt: EARLIER });
    const current = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: replaced.registerId,
    });
    await db.insert(deviceState).values([
      { deviceId: replaced.deviceId, lastAcceptedPushAt: NOW },
      { deviceId: current.deviceId, lastAcceptedPushAt: EARLIER },
    ]);

    expect(await inServiceRegisters()).toEqual([
      expect.objectContaining({ deviceId: current.deviceId, lastAcceptedPushAt: EARLIER }),
    ]);
  });

  it("lists nothing for a register that has no installation yet", async () => {
    const enrolled = await insertEnrolledInstallation(db, { now: NOW, revokedAt: EARLIER });
    await db.insert(registers).values({ locationId: enrolled.locationId, name: "Caja 2" });

    expect(await inServiceRegisters()).toEqual([]);
  });
});
