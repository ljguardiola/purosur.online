import { describe, expect, it } from "vitest";
import type { SerialDeviceStanding } from "../../register/index.js";
import { argentinaInstant } from "../../shared/index.js";
import { ALERT_KINDS, isAlertKind } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";
import {
  REGISTER_OWN_CONDITIONS,
  registerOwnConditions,
  type StorageStanding,
} from "./register-own-conditions.js";

const MINUTE_MS = 60 * 1000;
const HOURS = [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "18:00" }];
const NOW = new Date(argentinaInstant("2026-10-05", "12:00"));

const MATCHING: SerialDeviceStanding = { kind: "matching", path: "COM3" };

const HEALTHY_STORAGE: StorageStanding = {
  startupShortOf: null,
  diskStanding: "enough",
  diskFreeRatio: 0.4,
  walOversized: false,
};

function minutesBefore(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() - minutes * MINUTE_MS);
}

function conditions(overrides: Partial<Parameters<typeof registerOwnConditions>[0]> = {}) {
  return registerOwnConditions({
    salesStop: { stopped: false },
    latestPreEmissionGate: { kind: "passed" },
    lastAcceptedPushAt: minutesBefore(NOW, 1),
    hours: HOURS,
    now: NOW,
    serialDevices: { scale: MATCHING, reader: MATCHING },
    storage: HEALTHY_STORAGE,
    ...overrides,
  });
}

describe("REGISTER_OWN_CONDITIONS", () => {
  it("names the revoked installation first, then the sales denial, the stopped fiscal emission, the silent register, the missing serial device, the low disk and the oversized WAL", () => {
    expect(REGISTER_OWN_CONDITIONS).toEqual([
      "installation_revoked",
      "sales_denied",
      "fiscal_emission_stopped",
      "register_silent",
      "serial_device_missing",
      "disk_space_low",
      "wal_oversized",
    ]);
  });

  it("names alert kinds besides the conditions the cloud does not raise as alerts", () => {
    const notAlerts = [
      "installation_revoked",
      "serial_device_missing",
      "disk_space_low",
      "wal_oversized",
    ];
    for (const condition of REGISTER_OWN_CONDITIONS) {
      if (!notAlerts.includes(condition)) {
        expect(ALERT_KINDS).toContain(condition);
      }
    }
    for (const condition of notAlerts) {
      expect(ALERT_KINDS).not.toContain(condition);
    }
  });
});

describe("registerOwnConditions", () => {
  it("is empty for a register that sells and was accepted a minute ago", () => {
    expect(conditions()).toEqual([]);
  });

  it("holds sales_denied, naming the broken event history as its reason, while sales are stopped because it broke", () => {
    expect(conditions({ salesStop: { stopped: true, reason: "event_history_broken" } })).toEqual([
      { kind: "sales_denied", reason: "event_history_broken", level: "critical" },
    ]);
  });

  it("does not hold sales_denied for a register stopped for a reason it did not record", () => {
    expect(conditions({ salesStop: { stopped: true, reason: undefined } })).toEqual([]);
  });

  it("holds fiscal_emission_stopped while the latest pre-emission check failed", () => {
    expect(
      conditions({ latestPreEmissionGate: { kind: "failed", reason: "legal_name_missing" } }),
    ).toEqual([{ kind: "fiscal_emission_stopped", level: "critical" }]);
  });

  it("does not hold fiscal_emission_stopped for a register that never evaluated the pre-emission check", () => {
    expect(conditions({ latestPreEmissionGate: undefined })).toEqual([]);
  });

  it("lists fiscal_emission_stopped before register_silent", () => {
    expect(
      conditions({
        latestPreEmissionGate: { kind: "failed", reason: "legal_name_missing" },
        lastAcceptedPushAt: minutesBefore(NOW, 60),
      }),
    ).toEqual([
      { kind: "fiscal_emission_stopped", level: "critical" },
      { kind: "register_silent", level: "critical" },
    ]);
  });

  it("does not hold fiscal_emission_stopped while sales are denied, whatever the latest pre-emission check", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: "event_history_broken" },
        latestPreEmissionGate: { kind: "failed", reason: "legal_name_missing" },
      }),
    ).toEqual([{ kind: "sales_denied", reason: "event_history_broken", level: "critical" }]);
  });

  it("does not hold fiscal_emission_stopped for a revoked installation, whatever the latest pre-emission check", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: "installation_revoked" },
        latestPreEmissionGate: { kind: "failed", reason: "legal_name_missing" },
      }),
    ).toEqual([{ kind: "installation_revoked", level: "critical" }]);
  });

  it("does not hold fiscal_emission_stopped while sales are stopped for a reason it did not record", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: undefined },
        latestPreEmissionGate: { kind: "failed", reason: "legal_name_missing" },
      }),
    ).toEqual([]);
  });

  it("holds only installation_revoked for a revoked installation, however long since its last accepted push", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: "installation_revoked" },
        lastAcceptedPushAt: minutesBefore(NOW, 60),
      }),
    ).toEqual([{ kind: "installation_revoked", level: "critical" }]);
  });

  it("does not hold installation_revoked for a register that sells", () => {
    expect(conditions({ lastAcceptedPushAt: minutesBefore(NOW, 60) })).not.toContainEqual(
      expect.objectContaining({ kind: "installation_revoked" }),
    );
  });

  it("holds register_silent when the last accepted push is 15 minutes old within business hours", () => {
    expect(conditions({ lastAcceptedPushAt: minutesBefore(NOW, 15) })).toEqual([
      { kind: "register_silent", level: "critical" },
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
      { kind: "sales_denied", reason: "event_history_broken", level: "critical" },
      { kind: "register_silent", level: "critical" },
    ]);
  });

  it("holds serial_device_missing when the scale is not detected", () => {
    expect(
      conditions({ serialDevices: { scale: { kind: "not_detected" }, reader: MATCHING } }),
    ).toEqual([{ kind: "serial_device_missing", level: "warning" }]);
  });

  it("holds serial_device_missing when the reader is mismatched", () => {
    expect(
      conditions({ serialDevices: { scale: MATCHING, reader: { kind: "mismatched" } } }),
    ).toEqual([{ kind: "serial_device_missing", level: "warning" }]);
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
    ).toEqual([{ kind: "sales_denied", reason: "event_history_broken", level: "critical" }]);
  });

  it("gives each held condition that is an alert kind the level of its alert kind", () => {
    const held = [
      ...conditions({ salesStop: { stopped: true, reason: "event_history_broken" } }),
      ...conditions({
        latestPreEmissionGate: { kind: "failed", reason: "legal_name_missing" },
        lastAcceptedPushAt: minutesBefore(NOW, 60),
      }),
    ];

    expect(held.map((condition) => condition.kind)).toEqual([
      "sales_denied",
      "fiscal_emission_stopped",
      "register_silent",
    ]);
    for (const condition of held) {
      expect(isAlertKind(condition.kind)).toBe(true);
      if (isAlertKind(condition.kind)) {
        expect(condition.level).toBe(alertKindPolicy(condition.kind).level);
      }
    }
  });

  it("lists serial_device_missing after register_silent", () => {
    expect(
      conditions({
        lastAcceptedPushAt: minutesBefore(NOW, 60),
        serialDevices: { scale: { kind: "not_detected" }, reader: MATCHING },
      }),
    ).toEqual([
      { kind: "register_silent", level: "critical" },
      { kind: "serial_device_missing", level: "warning" },
    ]);
  });

  it("holds nothing of storage while no reading of it is current", () => {
    expect(conditions({ storage: null })).toEqual([]);
  });

  it("holds nothing of storage for a register given no reading of it", () => {
    expect(conditions({ storage: undefined })).toEqual([]);
  });

  it("holds disk_space_low as a warning while the disk is low", () => {
    expect(
      conditions({ storage: { ...HEALTHY_STORAGE, diskStanding: "low", diskFreeRatio: 0.08 } }),
    ).toEqual([{ kind: "disk_space_low", level: "warning" }]);
  });

  it("holds sales_denied for a full disk, with the free ratio, in place of disk_space_low", () => {
    expect(
      conditions({ storage: { ...HEALTHY_STORAGE, diskStanding: "full", diskFreeRatio: 0.03 } }),
    ).toEqual([
      { kind: "sales_denied", reason: "disk_full", disk_free_ratio: 0.03, level: "critical" },
    ]);
  });

  it("holds sales_denied for a register short of space at startup, with the space it requires", () => {
    expect(
      conditions({
        storage: { ...HEALTHY_STORAGE, startupShortOf: { requiredFreeBytes: 5_000_000_000 } },
      }),
    ).toEqual([
      {
        kind: "sales_denied",
        reason: "disk_space_short_at_startup",
        required_free_bytes: 5_000_000_000,
        level: "critical",
      },
    ]);
  });

  it("names the startup shortage over a full disk when both hold", () => {
    expect(
      conditions({
        storage: {
          startupShortOf: { requiredFreeBytes: 5_000_000_000 },
          diskStanding: "full",
          diskFreeRatio: 0.03,
          walOversized: false,
        },
      }),
    ).toEqual([
      {
        kind: "sales_denied",
        reason: "disk_space_short_at_startup",
        required_free_bytes: 5_000_000_000,
        level: "critical",
      },
    ]);
  });

  it("names a persisted stop's reason over a storage one", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: "event_history_broken" },
        storage: { ...HEALTHY_STORAGE, diskStanding: "full", diskFreeRatio: 0.03 },
      }),
    ).toEqual([{ kind: "sales_denied", reason: "event_history_broken", level: "critical" }]);
  });

  it("holds only installation_revoked for a revoked installation, whatever the storage", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: "installation_revoked" },
        storage: { ...HEALTHY_STORAGE, diskStanding: "full", diskFreeRatio: 0.03 },
      }),
    ).toEqual([{ kind: "installation_revoked", level: "critical" }]);
  });

  it("holds wal_oversized as a warning while the WAL is oversized", () => {
    expect(conditions({ storage: { ...HEALTHY_STORAGE, walOversized: true } })).toEqual([
      { kind: "wal_oversized", level: "warning" },
    ]);
  });

  it("lists disk_space_low before wal_oversized, after serial_device_missing", () => {
    expect(
      conditions({
        serialDevices: { scale: { kind: "not_detected" }, reader: MATCHING },
        storage: { ...HEALTHY_STORAGE, diskStanding: "low", walOversized: true },
      }),
    ).toEqual([
      { kind: "serial_device_missing", level: "warning" },
      { kind: "disk_space_low", level: "warning" },
      { kind: "wal_oversized", level: "warning" },
    ]);
  });
});
