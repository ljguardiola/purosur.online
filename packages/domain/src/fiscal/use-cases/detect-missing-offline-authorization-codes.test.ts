import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import { detectMissingOfflineAuthorizationCodes } from "./detect-missing-offline-authorization-codes.js";
import {
  FakeMissingOfflineAuthorizationCodeAlerts,
  FakeOfflineAuthorizationCodeHoldingReader,
  type FakeWatchedHolding,
  FixedClock,
} from "./test-support/fake-missing-offline-authorization-codes.js";

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

function detect(
  registers: FakeWatchedHolding[],
  moment: Date,
  alerts = new FakeMissingOfflineAuthorizationCodeAlerts(),
) {
  const holdings = new FakeOfflineAuthorizationCodeHoldingReader(registers);
  const outcome = detectMissingOfflineAuthorizationCodes({
    holdings,
    alerts,
    clock: new FixedClock(moment),
  });
  return { holdings, alerts, outcome };
}

function missing(scope: string, level: string) {
  return { holds: true, level, alert: expect.objectContaining({ scope }) };
}

function held(scope: string) {
  return { holds: false, kind: "offline_authorization_code_missing", scope };
}

describe("detectMissingOfflineAuthorizationCodes", () => {
  it("reports the next fortnight's code missing at the informational level on the day its window opens, naming the register's device and the fortnight", async () => {
    const { alerts, outcome } = detect([register()], at("2026-10-11"));

    await expect(outcome).resolves.toBe(1);
    expect(alerts.observations).toEqual([
      {
        holds: true,
        level: "informational",
        alert: {
          kind: "offline_authorization_code_missing",
          scope: "register-1:2026-10-16",
          detail: {
            deviceId: "device-1",
            fortnightStart: "2026-10-16",
            fortnightEnd: "2026-10-31",
          },
        },
      },
    ]);
  });

  it("reports nothing the day before the window opens", async () => {
    const { alerts, outcome } = detect([register()], at("2026-10-10"));

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([]);
  });

  it.each([
    ["2026-10-13", "warning"],
    ["2026-10-15", "critical"],
  ] as const)(
    "reports the code missing already at the level of the day it is first seen: %s is %s",
    async (day, level) => {
      const { alerts, outcome } = detect([register()], at(day));
      await outcome;

      expect(alerts.observations).toEqual([missing("register-1:2026-10-16", level)]);
    },
  );

  it("reports the current fortnight's code missing at the critical level for a register that lacks it, as one enrolled in mid-fortnight does", async () => {
    const { alerts, outcome } = detect([register({ holdsCodeOf: [] })], at("2026-10-07"));
    await outcome;

    expect(alerts.observations).toEqual([missing("register-1:2026-10-01", "critical")]);
  });

  it("reports the code of each of the two open fortnights missing while both lack it", async () => {
    const { alerts, outcome } = detect([register({ holdsCodeOf: [] })], at("2026-10-12"));

    await expect(outcome).resolves.toBe(2);
    expect(alerts.observations).toEqual([
      missing("register-1:2026-10-01", "critical"),
      missing("register-1:2026-10-16", "informational"),
    ]);
  });

  it("reports nothing for a fortnight whose code the register holds", async () => {
    const { alerts, outcome } = detect(
      [register({ holdsCodeOf: [FIRST_HALF.start, SECOND_HALF.start] })],
      at("2026-10-15"),
    );

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([]);
  });

  it("raises the level it reports as the days go by", async () => {
    const alerts = new FakeMissingOfflineAuthorizationCodeAlerts();

    await detect([register()], at("2026-10-11"), alerts).outcome;
    await detect([register()], at("2026-10-13"), alerts).outcome;
    await detect([register()], at("2026-10-15"), alerts).outcome;

    expect(alerts.observations).toEqual([
      missing("register-1:2026-10-16", "informational"),
      missing("register-1:2026-10-16", "warning"),
      missing("register-1:2026-10-16", "critical"),
    ]);
  });

  it("reports each register's missing code on its own", async () => {
    const { alerts, outcome } = detect(
      [register(), register({ registerId: "register-2", deviceId: "device-2" })],
      at("2026-10-11"),
    );
    await outcome;

    expect(alerts.observations).toEqual([
      missing("register-1:2026-10-16", "informational"),
      missing("register-2:2026-10-16", "informational"),
    ]);
  });

  it("keeps reporting the code missing, and never held, while the register of an open alert still lacks it", async () => {
    const { alerts, outcome } = detect(
      [register()],
      at("2026-10-13"),
      new FakeMissingOfflineAuthorizationCodeAlerts(["register-1:2026-10-16"]),
    );
    await outcome;

    expect(alerts.observations).toEqual([missing("register-1:2026-10-16", "warning")]);
  });

  it("reports the code of an open alert held once the register holds it", async () => {
    const { alerts, outcome } = detect(
      [register({ holdsCodeOf: [FIRST_HALF.start, SECOND_HALF.start] })],
      at("2026-10-12"),
      new FakeMissingOfflineAuthorizationCodeAlerts(["register-1:2026-10-16"]),
    );

    await expect(outcome).resolves.toBe(0);
    expect(alerts.observations).toEqual([held("register-1:2026-10-16")]);
  });

  it("reports the code of a fortnight that has ended held, even if the register never held it", async () => {
    const { alerts, outcome } = detect(
      [register({ holdsCodeOf: [SECOND_HALF.start] })],
      at("2026-10-16"),
      new FakeMissingOfflineAuthorizationCodeAlerts(["register-1:2026-10-01"]),
    );
    await outcome;

    expect(alerts.observations).toEqual([held("register-1:2026-10-01")]);
  });

  it("keeps reporting a fortnight's code missing on its last day", async () => {
    const { alerts, outcome } = detect(
      [register({ holdsCodeOf: [SECOND_HALF.start] })],
      at("2026-10-15"),
      new FakeMissingOfflineAuthorizationCodeAlerts(["register-1:2026-10-01"]),
    );
    await outcome;

    expect(alerts.observations).toEqual([missing("register-1:2026-10-01", "critical")]);
  });

  it("reports the code of an open alert held once its register is no longer watched", async () => {
    const { alerts, outcome } = detect(
      [],
      at("2026-10-12"),
      new FakeMissingOfflineAuthorizationCodeAlerts(["register-1:2026-10-16"]),
    );
    await outcome;

    expect(alerts.observations).toEqual([held("register-1:2026-10-16")]);
  });

  it("reports the code of an open alert whose window has not opened yet held", async () => {
    const { alerts, outcome } = detect(
      [register()],
      at("2026-10-10"),
      new FakeMissingOfflineAuthorizationCodeAlerts(["register-1:2026-10-16"]),
    );
    await outcome;

    expect(alerts.observations).toEqual([held("register-1:2026-10-16")]);
  });

  it("reads the holdings once, for the fortnights whose window is open", async () => {
    const { holdings, outcome } = detect([register()], at("2026-10-11"));
    await outcome;

    expect(holdings.requestedFortnights).toEqual([[FIRST_HALF, SECOND_HALF]]);
  });

  it("reads only the current fortnight before the next one's window opens", async () => {
    const { holdings, outcome } = detect([register()], at("2026-10-10"));
    await outcome;

    expect(holdings.requestedFortnights).toEqual([[FIRST_HALF]]);
  });

  it("tells the day by Argentina's calendar, not by UTC's", async () => {
    const before = detect([register()], new Date("2026-10-11T01:30:00.000Z"));
    await before.outcome;
    expect(before.alerts.observations).toEqual([]);

    const after = detect([register()], new Date("2026-10-11T03:00:00.000Z"));
    await after.outcome;
    expect(after.alerts.observations).toEqual([missing("register-1:2026-10-16", "informational")]);
  });
});
