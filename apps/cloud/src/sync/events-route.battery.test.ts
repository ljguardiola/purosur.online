import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { deviceState } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { eventsRouteUnderTest, NOW } from "./test-support/events-route.js";

const TELEMETRY = { wal_size_bytes: 4096, disk_free_bytes: 50_000_000, disk_free_ratio: 0.42 };
const PRESENT = {
  present: true,
  charge_percent: 64,
  health_percent: 88,
  on_battery: true,
  on_battery_minutes: 12,
};

let logged: { message: string; context: { deviceId: string } }[] = [];
const route = eventsRouteUnderTest(undefined, (message, context) => {
  logged.push({ message, context });
});

beforeEach(() => {
  logged = [];
});

async function registered() {
  return insertEnrolledInstallation(route.db, { now: NOW });
}

function push(deviceToken: string, battery?: unknown) {
  return route.app.inject({
    method: "POST",
    url: "/events",
    payload: {
      app_version: "1.4.0",
      telemetry: battery === undefined ? TELEMETRY : { ...TELEMETRY, battery },
      events: [],
    },
    headers: { authorization: `Bearer ${deviceToken}` },
  });
}

async function batteryOf(deviceId: string) {
  const [row] = await route.db
    .select({
      present: deviceState.batteryPresent,
      chargePercent: deviceState.batteryChargePercent,
      healthPercent: deviceState.batteryHealthPercent,
      onBattery: deviceState.batteryOnBattery,
      onBatteryMinutes: deviceState.batteryOnBatteryMinutes,
      reportedAt: deviceState.batteryReportedAt,
    })
    .from(deviceState)
    .where(eq(deviceState.deviceId, deviceId));
  return row;
}

describe("the battery a register reports through POST /events", () => {
  it.each([
    ["a present battery", PRESENT],
    ["an absent battery", { present: false }],
    ["a battery report it cannot read", { ...PRESENT, charge_percent: 150 }],
  ])("answers a push carrying %s as it answers one without a battery", async (_name, battery) => {
    const { deviceToken } = await registered();
    const without = await push(deviceToken);

    const response = await push(deviceToken, battery);

    expect(response.statusCode).toBe(without.statusCode);
    expect(response.json()).toEqual(without.json());
  });

  it("keeps the battery a push reported", async () => {
    const { deviceId, deviceToken } = await registered();

    await push(deviceToken, PRESENT);

    expect(await batteryOf(deviceId)).toEqual({
      present: true,
      chargePercent: 64,
      healthPercent: 88,
      onBattery: true,
      onBatteryMinutes: 12,
      reportedAt: NOW,
    });
  });

  it("logs nothing for a battery report it can read or one that is missing", async () => {
    const { deviceToken } = await registered();

    await push(deviceToken, PRESENT);
    await push(deviceToken, { present: false });
    await push(deviceToken);

    expect(logged).toEqual([]);
  });

  it("warns, naming the installation, that it dropped a battery report it cannot read", async () => {
    const { deviceId, deviceToken } = await registered();

    await push(deviceToken, { ...PRESENT, charge_percent: 150 });

    expect(logged).toEqual([
      { message: expect.stringContaining("battery"), context: { deviceId } },
    ]);
  });

  it("keeps what it holds when the battery report of a push cannot be read", async () => {
    const { deviceId, deviceToken } = await registered();
    await push(deviceToken, PRESENT);

    await push(deviceToken, { ...PRESENT, charge_percent: 150 });

    expect(await batteryOf(deviceId)).toMatchObject({ present: true, chargePercent: 64 });
  });
});
