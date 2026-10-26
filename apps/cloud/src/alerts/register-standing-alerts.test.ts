import type { RegisterTelemetry } from "@purosur/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { openAlert } from "./open-alert.js";
import {
  observeRegisterStops,
  observeRegisterSynced,
  observeRegisterVersionStanding,
} from "./register-standing-alerts.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const LATER = new Date("2026-10-01T13:00:00.000Z");
const REGISTER = "register-1";
const DEVICE = "device-1";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let location: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  location = await seededLocationId(db);
});

async function alertsOfKind(kind: string) {
  const rows = await db.select().from(alerts).where(eq(alerts.kind, kind));
  return rows.filter((row) => row.scope === REGISTER);
}

const REPORT: RegisterTelemetry = {
  wal_size_bytes: 4096,
  disk_free_bytes: 50_000_000,
  disk_free_ratio: 0.42,
};

describe("observeRegisterVersionStanding", () => {
  it("opens the update-required alert of the register for a version that is not accepted, naming the device and the version", async () => {
    await observeRegisterVersionStanding(
      db,
      { registerId: REGISTER, deviceId: DEVICE, appVersion: "0.1.0", accepted: false },
      NOW,
    );

    expect(await alertsOfKind("update_required")).toEqual([
      expect.objectContaining({
        detail: { deviceId: DEVICE, appVersion: "0.1.0" },
        resolvedAt: null,
        openedAt: NOW,
      }),
    ]);
  });

  it("resolves the register's open update-required alert once an accepted version reports", async () => {
    await observeRegisterVersionStanding(
      db,
      { registerId: REGISTER, deviceId: DEVICE, appVersion: "0.1.0", accepted: false },
      NOW,
    );

    await observeRegisterVersionStanding(
      db,
      { registerId: REGISTER, deviceId: DEVICE, appVersion: "1.4.0", accepted: true },
      LATER,
    );

    expect(await alertsOfKind("update_required")).toEqual([
      expect.objectContaining({ conditionClearedAt: LATER }),
    ]);
  });
});

describe("observeRegisterStops", () => {
  it("opens the sales-denied alert in the register's branch for a register that reports it can't sell", async () => {
    await observeRegisterStops(
      db,
      {
        registerId: REGISTER,
        deviceId: DEVICE,
        locationId: location,
        cloudZoneRulesVersion: null,
        report: { ...REPORT, sales_denied: true, sales_denied_reason: "event_history_broken" },
      },
      NOW,
    );

    expect(await alertsOfKind("sales_denied")).toEqual([
      expect.objectContaining({
        detail: { deviceId: DEVICE, reason: "event_history_broken" },
        resolvedAt: null,
      }),
    ]);
  });

  it("opens the fiscal-emission-stopped alert for a register that reports it stopped", async () => {
    await observeRegisterStops(
      db,
      {
        registerId: REGISTER,
        deviceId: DEVICE,
        locationId: location,
        cloudZoneRulesVersion: null,
        report: {
          ...REPORT,
          fiscal_emission_stopped: true,
          fiscal_emission_stopped_reason: "legal_name_missing",
        },
      },
      NOW,
    );

    expect(await alertsOfKind("fiscal_emission_stopped")).toEqual([
      expect.objectContaining({ detail: { deviceId: DEVICE, reason: "legal_name_missing" } }),
    ]);
  });

  it("opens the clock-drift alert for a register that reports its clock drifted", async () => {
    await observeRegisterStops(
      db,
      {
        registerId: REGISTER,
        deviceId: DEVICE,
        locationId: location,
        cloudZoneRulesVersion: null,
        report: { ...REPORT, clock_drift: true },
      },
      NOW,
    );

    expect(await alertsOfKind("clock_drift")).toEqual([
      expect.objectContaining({ detail: { deviceId: DEVICE }, resolvedAt: null }),
    ]);
  });

  it("clears the register's open clock-drift alert once it reports its clock within tolerance", async () => {
    await observeRegisterStops(
      db,
      {
        registerId: REGISTER,
        deviceId: DEVICE,
        locationId: location,
        cloudZoneRulesVersion: null,
        report: { ...REPORT, clock_drift: true },
      },
      NOW,
    );

    await observeRegisterStops(
      db,
      {
        registerId: REGISTER,
        deviceId: DEVICE,
        locationId: location,
        cloudZoneRulesVersion: null,
        report: { ...REPORT, clock_drift: false },
      },
      LATER,
    );

    expect(await alertsOfKind("clock_drift")).toEqual([
      expect.objectContaining({ conditionClearedAt: LATER }),
    ]);
  });

  it.each(["refused", "unreadable_event"] as const)(
    "opens an alert for a register that reports its replenishment failed as %s",
    async (failure) => {
      await observeRegisterStops(
        db,
        {
          registerId: REGISTER,
          deviceId: DEVICE,
          locationId: location,
          cloudZoneRulesVersion: null,
          report: { ...REPORT, replenishment_failed: failure },
        },
        NOW,
      );

      expect(await alertsOfKind("register_replenishment_failed")).toEqual([
        expect.objectContaining({ detail: { deviceId: DEVICE, failure }, resolvedAt: null }),
      ]);
    },
  );

  it("clears the register's open replenishment alert once it reports its replenishment completed", async () => {
    await observeRegisterStops(
      db,
      {
        registerId: REGISTER,
        deviceId: DEVICE,
        locationId: location,
        cloudZoneRulesVersion: null,
        report: { ...REPORT, replenishment_failed: "refused" },
      },
      NOW,
    );

    await observeRegisterStops(
      db,
      {
        registerId: REGISTER,
        deviceId: DEVICE,
        locationId: location,
        cloudZoneRulesVersion: null,
        report: { ...REPORT, replenishment_failed: false },
      },
      LATER,
    );

    expect(await alertsOfKind("register_replenishment_failed")).toEqual([
      expect.objectContaining({ conditionClearedAt: LATER }),
    ]);
  });

  it("opens nothing for a register that reports its replenishment has not failed", async () => {
    await observeRegisterStops(
      db,
      {
        registerId: REGISTER,
        deviceId: DEVICE,
        locationId: location,
        cloudZoneRulesVersion: null,
        report: { ...REPORT, replenishment_failed: false },
      },
      NOW,
    );

    expect(await db.select().from(alerts)).toEqual([]);
  });

  it("opens nothing for a register that reports its clock within tolerance", async () => {
    await observeRegisterStops(
      db,
      {
        registerId: REGISTER,
        deviceId: DEVICE,
        locationId: location,
        cloudZoneRulesVersion: null,
        report: { ...REPORT, clock_drift: false },
      },
      NOW,
    );

    expect(await db.select().from(alerts)).toEqual([]);
  });

  it("opens nothing for a register that reports nothing about selling or emitting", async () => {
    await observeRegisterStops(
      db,
      {
        registerId: REGISTER,
        deviceId: DEVICE,
        locationId: location,
        report: REPORT,
        cloudZoneRulesVersion: null,
      },
      NOW,
    );

    expect(await db.select().from(alerts)).toEqual([]);
  });
});

describe("observeRegisterSynced", () => {
  it("leaves no open silent-register alert once the register synced", async () => {
    await openAlert(
      db,
      {
        kind: "register_silent",
        scope: REGISTER,
        locationId: location,
        detail: { deviceId: DEVICE, lastAcceptedPushAt: NOW.toISOString() },
      },
      { now: () => NOW },
    );

    await observeRegisterSynced(db, REGISTER, LATER);

    const rows = await alertsOfKind("register_silent");
    expect(rows).toEqual([expect.objectContaining({ conditionClearedAt: LATER })]);
  });
});

describe("observeRegisterStops zone rules", () => {
  const register = { registerId: REGISTER, deviceId: DEVICE };

  it.each(["2025c", null])(
    "opens an alert naming both versions for a register that runs %s while the cloud has published 2026a",
    async (registerVersion) => {
      await observeRegisterStops(
        db,
        {
          ...register,
          locationId: location,
          report: { ...REPORT, zone_rules_version: registerVersion },
          cloudZoneRulesVersion: "2026a",
        },
        NOW,
      );

      expect(await alertsOfKind("tz_rules_mismatch")).toEqual([
        expect.objectContaining({
          detail: { deviceId: DEVICE, registerVersion, cloudVersion: "2026a" },
          resolvedAt: null,
          openedAt: NOW,
        }),
      ]);
    },
  );

  it("clears the register's open alert once it reports the cloud's version", async () => {
    await observeRegisterStops(
      db,
      {
        ...register,
        locationId: location,
        report: { ...REPORT, zone_rules_version: null },
        cloudZoneRulesVersion: "2026a",
      },
      NOW,
    );

    await observeRegisterStops(
      db,
      {
        ...register,
        locationId: location,
        report: { ...REPORT, zone_rules_version: "2026a" },
        cloudZoneRulesVersion: "2026a",
      },
      LATER,
    );

    expect(await alertsOfKind("tz_rules_mismatch")).toEqual([
      expect.objectContaining({ conditionClearedAt: LATER }),
    ]);
  });

  it("opens nothing for a register that reports nothing about its zone rules", async () => {
    await observeRegisterStops(
      db,
      { ...register, locationId: location, report: REPORT, cloudZoneRulesVersion: "2026a" },
      NOW,
    );

    expect(await alertsOfKind("tz_rules_mismatch")).toEqual([]);
  });

  it("opens nothing while the cloud has published no version", async () => {
    await observeRegisterStops(
      db,
      {
        ...register,
        locationId: location,
        report: { ...REPORT, zone_rules_version: null },
        cloudZoneRulesVersion: null,
      },
      NOW,
    );

    expect(await alertsOfKind("tz_rules_mismatch")).toEqual([]);
  });
});
