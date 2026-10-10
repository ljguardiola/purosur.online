import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import { detectMissingOfflineAuthorizationCodes } from "./detect-missing-offline-authorization-codes.js";
import { seededAlert } from "./test-support/alert-fixtures.js";
import { FakeAlertStore, FixedClock, PrefixHasher } from "./test-support/fake-alert-store.js";
import {
  FakeOfflineAuthorizationCodeHoldingReader,
  type FakeWatchedHolding,
} from "./test-support/fake-offline-authorization-code-holding-reader.js";

const FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };

function at(day: string, time = "12:00"): Date {
  return new Date(argentinaInstant(day, time));
}

function register(overrides: Partial<FakeWatchedHolding> = {}): FakeWatchedHolding {
  return {
    registerId: "register-1",
    deviceId: "device-1",
    holdsCodeOf: [FIRST_HALF.start],
    ...overrides,
  };
}

function storeWithViewer(): FakeAlertStore {
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

function detect(store: FakeAlertStore, registers: FakeWatchedHolding[], moment: Date) {
  const holdings = new FakeOfflineAuthorizationCodeHoldingReader(registers, store);
  const outcome = detectMissingOfflineAuthorizationCodes({
    holdings,
    store,
    clock: new FixedClock(moment),
    hasher: new PrefixHasher(),
  });
  return { holdings, outcome };
}

function seedOpenMissingCode(
  store: FakeAlertStore,
  fortnight: { start: string; end: string },
  overrides: Parameters<typeof seededAlert>[0] = {},
) {
  return store.seedAlert(
    seededAlert({
      id: `alert-${fortnight.start}`,
      kind: "offline_authorization_code_missing",
      scope: `register-1:${fortnight.start}`,
      level: "informational",
      escalateAt: null,
      detail: {
        deviceId: "device-1",
        fortnightStart: fortnight.start,
        fortnightEnd: fortnight.end,
      },
      ...overrides,
    }),
  );
}

describe("detectMissingOfflineAuthorizationCodes", () => {
  it("opens an informational alert for the next fortnight on the day its window opens, naming the register's device and the fortnight, for every person who sees all alerts", async () => {
    const store = storeWithViewer();

    const { outcome } = detect(store, [register()], at("2026-10-11"));

    await expect(outcome).resolves.toBe(1);
    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({
        kind: "offline_authorization_code_missing",
        scope: "register-1:2026-10-16",
        level: "informational",
        audience: "all",
        locationId: null,
        escalateAt: null,
        openedAt: at("2026-10-11"),
        detail: { deviceId: "device-1", fortnightStart: "2026-10-16", fortnightEnd: "2026-10-31" },
      }),
    ]);
    expect(store.snapshot().deliveries).toEqual([
      { alertId: "alert-1", recipientUserId: "administrator" },
    ]);
  });

  it("opens nothing the day before the window opens", async () => {
    const store = storeWithViewer();

    const { outcome } = detect(store, [register()], at("2026-10-10"));

    await expect(outcome).resolves.toBe(0);
    expect(store.snapshot().alerts).toEqual([]);
  });

  it.each([
    ["2026-10-13", "warning"],
    ["2026-10-15", "critical"],
  ] as const)(
    "opens the alert already at the level of the day it is first seen: %s is %s",
    async (day, level) => {
      const store = storeWithViewer();

      await detect(store, [register()], at(day)).outcome;

      expect(store.snapshot().alerts).toEqual([expect.objectContaining({ level })]);
    },
  );

  it("opens a critical alert for the current fortnight of a register that lacks its code, as one enrolled in mid-fortnight does", async () => {
    const store = storeWithViewer();

    await detect(store, [register({ holdsCodeOf: [] })], at("2026-10-07")).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ scope: "register-1:2026-10-01", level: "critical" }),
    ]);
  });

  it("opens an alert for each of the two open fortnights while both lack the code", async () => {
    const store = storeWithViewer();

    const { outcome } = detect(store, [register({ holdsCodeOf: [] })], at("2026-10-12"));

    await expect(outcome).resolves.toBe(2);
    expect(store.snapshot().alerts.map(({ scope, level }) => [scope, level])).toEqual([
      ["register-1:2026-10-01", "critical"],
      ["register-1:2026-10-16", "informational"],
    ]);
  });

  it("opens nothing for a fortnight whose code the register holds", async () => {
    const store = storeWithViewer();

    const { outcome } = detect(
      store,
      [register({ holdsCodeOf: [FIRST_HALF.start, SECOND_HALF.start] })],
      at("2026-10-15"),
    );

    await expect(outcome).resolves.toBe(0);
    expect(store.snapshot().alerts).toEqual([]);
  });

  it("raises the one open alert as the days go by and opens no second", async () => {
    const store = storeWithViewer();

    await detect(store, [register()], at("2026-10-11")).outcome;
    await detect(store, [register()], at("2026-10-13")).outcome;
    await detect(store, [register()], at("2026-10-15")).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ level: "critical", escalatedAt: at("2026-10-15") }),
    ]);
  });

  it("raises each register's alert on its own", async () => {
    const store = storeWithViewer();

    await detect(
      store,
      [register(), register({ registerId: "register-2", deviceId: "device-2" })],
      at("2026-10-11"),
    ).outcome;

    expect(store.snapshot().alerts.map(({ scope }) => scope)).toEqual([
      "register-1:2026-10-16",
      "register-2:2026-10-16",
    ]);
  });

  it("keeps the alert open and unmarked while the register still lacks the code", async () => {
    const store = storeWithViewer();
    seedOpenMissingCode(store, SECOND_HALF, { level: "warning" });

    await detect(store, [register()], at("2026-10-13")).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ resolvedAt: null, conditionClearedAt: null, level: "warning" }),
    ]);
  });

  it("marks the alert as cleared once the register holds the code, without resolving it yet", async () => {
    const store = storeWithViewer();
    seedOpenMissingCode(store, SECOND_HALF);

    await detect(
      store,
      [register({ holdsCodeOf: [FIRST_HALF.start, SECOND_HALF.start] })],
      at("2026-10-12"),
    ).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ resolvedAt: null, conditionClearedAt: at("2026-10-12") }),
    ]);
  });

  it("marks the alert of a fortnight that has ended as cleared, even if the register never held its code", async () => {
    const store = storeWithViewer();
    seedOpenMissingCode(store, FIRST_HALF, { level: "critical" });

    await detect(store, [register({ holdsCodeOf: [SECOND_HALF.start] })], at("2026-10-16")).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ conditionClearedAt: at("2026-10-16") }),
    ]);
  });

  it("keeps a fortnight's alert on its last day", async () => {
    const store = storeWithViewer();
    seedOpenMissingCode(store, FIRST_HALF, { level: "critical" });

    await detect(store, [register({ holdsCodeOf: [SECOND_HALF.start] })], at("2026-10-15")).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ conditionClearedAt: null }),
    ]);
  });

  it("marks the alert as cleared once the register is no longer watched", async () => {
    const store = storeWithViewer();
    seedOpenMissingCode(store, SECOND_HALF);

    await detect(store, [], at("2026-10-12")).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ conditionClearedAt: at("2026-10-12") }),
    ]);
  });

  it("marks the alert of a window that has not opened yet as cleared", async () => {
    const store = storeWithViewer();
    seedOpenMissingCode(store, SECOND_HALF);

    await detect(store, [register()], at("2026-10-10")).outcome;

    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ conditionClearedAt: at("2026-10-10") }),
    ]);
  });

  it("leaves the alerts of other kinds alone", async () => {
    const store = storeWithViewer();
    store.seedAlert(
      seededAlert({
        id: "alert-other",
        kind: "register_silent",
        scope: "register-1",
        level: "critical",
      }),
    );
    const before = store.snapshot();

    await detect(store, [], at("2026-10-12")).outcome;

    expect(store.snapshot()).toEqual(before);
  });

  it("reads the holdings once, for the fortnights whose window is open", async () => {
    const { holdings, outcome } = detect(storeWithViewer(), [register()], at("2026-10-11"));
    await outcome;

    expect(holdings.requestedFortnights).toEqual([[FIRST_HALF, SECOND_HALF]]);
  });

  it("reads only the current fortnight before the next one's window opens", async () => {
    const { holdings, outcome } = detect(storeWithViewer(), [register()], at("2026-10-10"));
    await outcome;

    expect(holdings.requestedFortnights).toEqual([[FIRST_HALF]]);
  });

  it("tells the day by Argentina's calendar, not by UTC's", async () => {
    const store = storeWithViewer();

    await detect(store, [register()], new Date("2026-10-11T01:30:00.000Z")).outcome;
    expect(store.snapshot().alerts).toEqual([]);

    await detect(store, [register()], new Date("2026-10-11T03:00:00.000Z")).outcome;
    expect(store.snapshot().alerts).toEqual([
      expect.objectContaining({ scope: "register-1:2026-10-16" }),
    ]);
  });
});
