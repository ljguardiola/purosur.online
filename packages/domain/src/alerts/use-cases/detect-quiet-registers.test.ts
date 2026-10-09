import { describe, expect, it } from "vitest";
import type { BranchWeeklyHoursRange } from "../../branch/index.js";
import type { WatchedRegister } from "../../register/index.js";
import { argentinaInstant } from "../../shared/index.js";
import { detectQuietRegisters } from "./detect-quiet-registers.js";
import { seededAlert } from "./test-support/alert-fixtures.js";
import { FakeAlertStore, FixedClock, PrefixHasher } from "./test-support/fake-alert-store.js";
import { FakeBranchHoursReader } from "./test-support/fake-branch-hours-reader.js";
import { FakeWatchedRegisterReader } from "./test-support/fake-watched-register-reader.js";

const MINUTE_MS = 60 * 1000;
const MONDAY_NOON = new Date(argentinaInstant("2026-10-05", "12:00"));
const OPEN_ALL_DAY = [{ dayOfWeek: 1, opensAt: "08:00", closesAt: "20:00" }];

function minutesBeforeNoon(minutes: number): Date {
  return new Date(MONDAY_NOON.getTime() - minutes * MINUTE_MS);
}

function register(overrides: Partial<WatchedRegister> = {}): WatchedRegister {
  return {
    registerId: "register-1",
    deviceId: "device-1",
    locationId: "location-1",
    lastSuccessfulSyncAt: minutesBeforeNoon(20),
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

function detect(
  store: FakeAlertStore,
  registers: WatchedRegister[],
  {
    at = MONDAY_NOON,
    hoursOfBranch = {},
  }: { at?: Date; hoursOfBranch?: Record<string, BranchWeeklyHoursRange[]> } = {},
) {
  const reader = new FakeWatchedRegisterReader(registers);
  const branchHours = new FakeBranchHoursReader({
    "location-1": OPEN_ALL_DAY,
    "location-2": OPEN_ALL_DAY,
    ...hoursOfBranch,
  });
  const outcome = detectQuietRegisters({
    registers: reader,
    branchHours,
    store,
    clock: new FixedClock(at),
    hasher: new PrefixHasher(),
  });
  return { reader, branchHours, outcome };
}

describe("detectQuietRegisters", () => {
  it("opens a critical alert in the register's branch for a register with no successful sync in 15 minutes during business hours, naming its device and last sync", async () => {
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

  it("opens nothing for a register that synced within the last 15 minutes", async () => {
    const store = storeWithViewers();

    const { outcome } = detect(store, [register({ lastSuccessfulSyncAt: minutesBeforeNoon(14) })]);

    await expect(outcome).resolves.toBe(0);
    expect(store.snapshot().alerts).toEqual([]);
  });

  it("opens nothing while the 15-minute lapse is not entirely inside business hours", async () => {
    const store = storeWithViewers();
    const opensInsideTheLapse = [{ dayOfWeek: 1, opensAt: "11:55", closesAt: "20:00" }];
    const closesInsideTheLapse = [{ dayOfWeek: 1, opensAt: "08:00", closesAt: "11:55" }];
    const closedMonday = [{ dayOfWeek: 2, opensAt: "08:00", closesAt: "20:00" }];

    for (const hours of [opensInsideTheLapse, closesInsideTheLapse, closedMonday, []]) {
      await detect(store, [register()], { hoursOfBranch: { "location-1": hours } }).outcome;
    }

    expect(store.snapshot().alerts).toEqual([]);
  });

  it("weighs each register against the hours of its own branch", async () => {
    const store = storeWithViewers();
    const closedMonday = [{ dayOfWeek: 2, opensAt: "08:00", closesAt: "20:00" }];

    await detect(
      store,
      [register(), register({ registerId: "register-2", locationId: "location-2" })],
      { hoursOfBranch: { "location-2": closedMonday } },
    ).outcome;

    expect(store.snapshot().alerts.map(({ scope }) => scope)).toEqual(["register-1"]);
  });

  it("raises one alert per quiet register and leaves the others alone", async () => {
    const store = storeWithViewers();

    const { outcome } = detect(store, [
      register({ registerId: "register-1", deviceId: "device-1" }),
      register({
        registerId: "register-2",
        deviceId: "device-2",
        lastSuccessfulSyncAt: minutesBeforeNoon(3),
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
    await detect(store, [register()], { at: new Date(MONDAY_NOON.getTime() + MINUTE_MS) }).outcome;

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

  it("reads the watched registers once", async () => {
    const { reader, outcome } = detect(storeWithViewers(), [
      register(),
      register({ registerId: "register-2" }),
    ]);
    await outcome;

    expect(reader.reads).toBe(1);
  });

  it("reads the hours of each branch once, however many of its registers it weighs", async () => {
    const { branchHours, outcome } = detect(storeWithViewers(), [
      register(),
      register({ registerId: "register-2" }),
      register({ registerId: "register-3", locationId: "location-2" }),
    ]);
    await outcome;

    expect(branchHours.reads).toEqual(["location-1", "location-2"]);
  });
});
