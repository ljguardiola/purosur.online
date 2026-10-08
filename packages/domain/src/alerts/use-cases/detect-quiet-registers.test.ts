import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import { detectQuietRegisters } from "./detect-quiet-registers.js";
import type { InServiceRegister } from "./in-service-register-reader.js";
import { seededAlert } from "./test-support/alert-fixtures.js";
import { FakeAlertStore, FixedClock, PrefixHasher } from "./test-support/fake-alert-store.js";
import { FakeInServiceRegisterReader } from "./test-support/fake-in-service-register-reader.js";

const MINUTE_MS = 60 * 1000;
const MONDAY_NOON = new Date(argentinaInstant("2026-10-05", "12:00"));
const OPEN_ALL_DAY = [{ dayOfWeek: 1, opensAt: "08:00", closesAt: "20:00" }];

function minutesBeforeNoon(minutes: number): Date {
  return new Date(MONDAY_NOON.getTime() - minutes * MINUTE_MS);
}

function register(overrides: Partial<InServiceRegister> = {}): InServiceRegister {
  return {
    registerId: "register-1",
    deviceId: "device-1",
    locationId: "location-1",
    enrolledAt: minutesBeforeNoon(24 * 60),
    lastAcceptedPushAt: minutesBeforeNoon(20),
    hours: OPEN_ALL_DAY,
    ...overrides,
  };
}

function storeWithViewers(): FakeAlertStore {
  const store = new FakeAlertStore();
  store.seedViewer({
    userId: "administrator",
    locationId: "location-elsewhere",
    permissionKeys: [],
    isAdministrator: true,
    active: true,
  });
  return store;
}

function detect(store: FakeAlertStore, registers: InServiceRegister[], at = MONDAY_NOON) {
  const reader = new FakeInServiceRegisterReader(registers);
  const outcome = detectQuietRegisters({
    registers: reader,
    store,
    clock: new FixedClock(at),
    hasher: new PrefixHasher(),
  });
  return { reader, outcome };
}

describe("detectQuietRegisters", () => {
  it("opens a critical alert in the register's branch for a register with no push accepted in 15 minutes during business hours, naming its device and last accepted push", async () => {
    const store = storeWithViewers();

    const { outcome } = detect(store, [register()]);

    await expect(outcome).resolves.toBe(1);
    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({
        kind: "register_silent",
        scope: "register-1",
        level: "critical",
        audience: "local",
        locationId: "location-1",
        escalateAt: null,
        openedAt: MONDAY_NOON,
        detail: { deviceId: "device-1", lastAcceptedPushAt: minutesBeforeNoon(20).toISOString() },
      }),
    ]);
  });

  it("delivers the alert to the users who may see it", async () => {
    const store = storeWithViewers();

    await detect(store, [register()]).outcome;

    expect(store.snapshot().deliveries).toEqual([
      { alertId: "alert-1", recipientUserId: "administrator" },
    ]);
  });

  it("opens nothing for a register that pushed within the last 15 minutes", async () => {
    const store = storeWithViewers();

    const { outcome } = detect(store, [register({ lastAcceptedPushAt: minutesBeforeNoon(14) })]);

    await expect(outcome).resolves.toBe(0);
    expect(store.snapshot().alerts).toEqual([]);
  });

  it("opens nothing while the 15-minute lapse is not entirely inside business hours", async () => {
    const store = storeWithViewers();
    const opensInsideTheLapse = [{ dayOfWeek: 1, opensAt: "11:55", closesAt: "20:00" }];
    const closesInsideTheLapse = [{ dayOfWeek: 1, opensAt: "08:00", closesAt: "11:55" }];
    const closedMonday = [{ dayOfWeek: 2, opensAt: "08:00", closesAt: "20:00" }];

    for (const hours of [opensInsideTheLapse, closesInsideTheLapse, closedMonday, []]) {
      await detect(store, [register({ hours })]).outcome;
    }

    expect(store.snapshot().alerts).toEqual([]);
  });

  it("counts a register that never had a push accepted from its enrollment", async () => {
    const store = storeWithViewers();
    const never = (enrolledMinutesAgo: number) =>
      register({ lastAcceptedPushAt: null, enrolledAt: minutesBeforeNoon(enrolledMinutesAgo) });

    await detect(store, [never(10)]).outcome;
    expect(store.snapshot().alerts).toEqual([]);

    await detect(store, [never(30)]).outcome;
    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ detail: { deviceId: "device-1", lastAcceptedPushAt: null } }),
    ]);
  });

  it("raises one alert per quiet register and leaves the others alone", async () => {
    const store = storeWithViewers();

    const { outcome } = detect(store, [
      register({ registerId: "register-1", deviceId: "device-1" }),
      register({
        registerId: "register-2",
        deviceId: "device-2",
        lastAcceptedPushAt: minutesBeforeNoon(3),
      }),
      register({ registerId: "register-3", deviceId: "device-3", locationId: "location-2" }),
    ]);

    await expect(outcome).resolves.toBe(2);
    expect(store.snapshot().alerts.map(({ scope, locationId }) => [scope, locationId])).toEqual([
      ["register-1", "location-1"],
      ["register-3", "location-2"],
    ]);
  });

  it("keeps the one alert open, opening no second, while the register stays quiet", async () => {
    const store = storeWithViewers();

    await detect(store, [register()]).outcome;
    await detect(store, [register()], new Date(MONDAY_NOON.getTime() + MINUTE_MS)).outcome;

    expect(store.snapshot().alerts).toHaveLength(1);
  });

  it("takes back the clearing of an open alert when the register is quiet again", async () => {
    const store = storeWithViewers();
    store.seedAlert(
      seededAlert({
        kind: "register_silent",
        scope: "register-1",
        level: "critical",
        audience: "local",
        locationId: "location-1",
        escalateAt: null,
        conditionClearedAt: minutesBeforeNoon(5),
      }),
    );

    await detect(store, [register()]).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ resolvedAt: null, conditionClearedAt: null }),
    ]);
  });

  it("reads the in-service registers once", async () => {
    const { reader, outcome } = detect(storeWithViewers(), [
      register(),
      register({ registerId: "register-2" }),
    ]);
    await outcome;

    expect(reader.reads).toBe(1);
  });
});
