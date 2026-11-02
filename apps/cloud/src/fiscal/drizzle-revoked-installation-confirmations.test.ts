import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleRevokedInstallationConfirmations } from "./drizzle-revoked-installation-confirmations.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";
import { confirmRevokedInstallation } from "./test-support/revoked-installation-fixtures.js";

const NOW = new Date("2026-10-16T12:00:00.000Z");
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

describe("DrizzleRevokedInstallationConfirmations.confirmedInstallations", () => {
  it("answers no installation while nobody confirmed one", async () => {
    await seedOfflinePointOfSale(db);

    expect(
      await new DrizzleRevokedInstallationConfirmations(db).confirmedInstallations({
        pointOfSaleNumber: 8,
        fortnight: FIRST_HALF,
      }),
    ).toEqual([]);
  });

  it("answers every installation confirmed for the fortnight of the point of sale", async () => {
    const registerId = await seedOfflinePointOfSale(db);
    const first = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
      revokedAt: NOW,
    });
    const second = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
      revokedAt: NOW,
    });
    for (const { deviceId } of [first, second]) {
      await confirmRevokedInstallation(db, {
        pointOfSaleNumber: 8,
        fortnight: FIRST_HALF,
        installationId: deviceId,
      });
    }

    const confirmed = await new DrizzleRevokedInstallationConfirmations(db).confirmedInstallations({
      pointOfSaleNumber: 8,
      fortnight: FIRST_HALF,
    });

    expect([...confirmed].sort()).toEqual([first.deviceId, second.deviceId].sort());
  });

  it("leaves out what was confirmed for another fortnight or another point of sale", async () => {
    const registerId = await seedOfflinePointOfSale(db);
    const { deviceId } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
      revokedAt: NOW,
    });
    await confirmRevokedInstallation(db, {
      pointOfSaleNumber: 8,
      fortnight: SECOND_HALF,
      installationId: deviceId,
    });
    await confirmRevokedInstallation(db, {
      pointOfSaleNumber: 7,
      fortnight: FIRST_HALF,
      installationId: deviceId,
    });

    expect(
      await new DrizzleRevokedInstallationConfirmations(db).confirmedInstallations({
        pointOfSaleNumber: 8,
        fortnight: FIRST_HALF,
      }),
    ).toEqual([]);
  });
});
