import { describe, expect, it } from "vitest";
import type { SerialDeviceStanding } from "../../register/index.js";
import { argentinaInstant } from "../../shared/index.js";
import { ALERT_KINDS } from "./alert-catalog.js";
import { REGISTER_OWN_CONDITIONS, registerOwnConditions } from "./register-own-conditions.js";

const MINUTE_MS = 60 * 1000;
const HOURS = [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "18:00" }];
const NOW = new Date(argentinaInstant("2026-10-05", "12:00"));

const MATCHING: SerialDeviceStanding = { kind: "matching", path: "COM3" };

function minutesBefore(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() - minutes * MINUTE_MS);
}

function conditions(overrides: Partial<Parameters<typeof registerOwnConditions>[0]> = {}) {
  return registerOwnConditions({
    salesStop: { stopped: false },
    lastAcceptedPushAt: minutesBefore(NOW, 1),
    hours: HOURS,
    now: NOW,
    serialDevices: { scale: MATCHING, reader: MATCHING },
    ...overrides,
  });
}

describe("REGISTER_OWN_CONDITIONS", () => {
  it("names the revoked installation first, then the sales denial, the silent register and the missing serial device", () => {
    expect(REGISTER_OWN_CONDITIONS).toEqual([
      "installation_revoked",
      "sales_denied",
      "register_silent",
      "serial_device_missing",
    ]);
  });

  it("names alert kinds besides the revoked installation and the missing serial device, which the cloud does not raise as alerts", () => {
    for (const condition of REGISTER_OWN_CONDITIONS) {
      if (condition !== "installation_revoked" && condition !== "serial_device_missing") {
        expect(ALERT_KINDS).toContain(condition);
      }
    }
    expect(ALERT_KINDS).not.toContain("installation_revoked");
  });
});

describe("registerOwnConditions", () => {
  it("is empty for a register that sells and was accepted a minute ago", () => {
    expect(conditions()).toEqual([]);
  });

  it("holds sales_denied, naming the broken event history as its reason, while sales are stopped because it broke", () => {
    expect(conditions({ salesStop: { stopped: true, reason: "event_history_broken" } })).toEqual([
      { kind: "sales_denied", reason: "event_history_broken" },
    ]);
  });

  it("does not hold sales_denied for a register stopped for a reason it did not record", () => {
    expect(conditions({ salesStop: { stopped: true, reason: undefined } })).toEqual([]);
  });

  it("holds only installation_revoked for a revoked installation, however long since its last accepted push", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: "installation_revoked" },
        lastAcceptedPushAt: minutesBefore(NOW, 60),
      }),
    ).toEqual([{ kind: "installation_revoked" }]);
  });

  it("does not hold installation_revoked for a register that sells", () => {
    expect(conditions({ lastAcceptedPushAt: minutesBefore(NOW, 60) })).not.toContainEqual({
      kind: "installation_revoked",
    });
  });

  it("holds register_silent when the last accepted push is 15 minutes old within business hours", () => {
    expect(conditions({ lastAcceptedPushAt: minutesBefore(NOW, 15) })).toEqual([
      { kind: "register_silent" },
    ]);
  });

  it("does not hold register_silent when the last accepted push is under 15 minutes old", () => {
    expect(
      conditions({ lastAcceptedPushAt: new Date(NOW.getTime() - 15 * MINUTE_MS + 1) }),
    ).toEqual([]);
  });

  it("does not hold register_silent for a register that was never accepted", () => {
    expect(conditions({ lastAcceptedPushAt: null })).toEqual([]);
  });

  it("does not hold register_silent outside business hours", () => {
    expect(
      conditions({
        lastAcceptedPushAt: minutesBefore(NOW, 600),
        now: new Date(argentinaInstant("2026-10-05", "22:00")),
      }),
    ).toEqual([]);
  });

  it("does not hold register_silent for a branch with no hours", () => {
    expect(conditions({ lastAcceptedPushAt: minutesBefore(NOW, 600), hours: [] })).toEqual([]);
  });

  it("lists sales_denied and register_silent in catalog order", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: "event_history_broken" },
        lastAcceptedPushAt: minutesBefore(NOW, 60),
      }),
    ).toEqual([
      { kind: "sales_denied", reason: "event_history_broken" },
      { kind: "register_silent" },
    ]);
  });

  it("holds serial_device_missing when the scale is not detected", () => {
    expect(
      conditions({ serialDevices: { scale: { kind: "not_detected" }, reader: MATCHING } }),
    ).toEqual([{ kind: "serial_device_missing" }]);
  });

  it("holds serial_device_missing when the reader is mismatched", () => {
    expect(
      conditions({ serialDevices: { scale: MATCHING, reader: { kind: "mismatched" } } }),
    ).toEqual([{ kind: "serial_device_missing" }]);
  });

  it("does not hold serial_device_missing for devices that are not registered", () => {
    expect(
      conditions({
        serialDevices: { scale: { kind: "not_registered" }, reader: { kind: "not_registered" } },
      }),
    ).toEqual([]);
  });

  it("does not hold serial_device_missing while no listing of the serial devices is current", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: "event_history_broken" },
        serialDevices: null,
      }),
    ).toEqual([{ kind: "sales_denied", reason: "event_history_broken" }]);
  });

  it("lists serial_device_missing after register_silent", () => {
    expect(
      conditions({
        lastAcceptedPushAt: minutesBefore(NOW, 60),
        serialDevices: { scale: { kind: "not_detected" }, reader: MATCHING },
      }),
    ).toEqual([{ kind: "register_silent" }, { kind: "serial_device_missing" }]);
  });
});
