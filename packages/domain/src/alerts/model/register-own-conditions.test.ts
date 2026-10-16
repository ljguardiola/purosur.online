import { describe, expect, expectTypeOf, it } from "vitest";
import type { BatteryReport, SerialDeviceStanding, StorageStanding } from "../../register/index.js";
import { argentinaInstant } from "../../shared/index.js";
import { ALERT_KINDS, isAlertKind } from "./alert-catalog.js";
import { alertKindPolicy } from "./alert-kind-policy.js";
import {
  batteryConditionsOf,
  REGISTER_OWN_CONDITIONS,
  registerOwnConditions,
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

function onBatteryAt(chargePercent: number, onBatteryMinutes = 0): BatteryReport {
  return {
    present: true,
    charge_percent: chargePercent,
    on_battery: true,
    on_battery_minutes: onBatteryMinutes,
  };
}

function onMainsAt(chargePercent: number): BatteryReport {
  return {
    present: true,
    charge_percent: chargePercent,
    on_battery: false,
    on_battery_minutes: 0,
  };
}

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
    localDatabaseDamaged: false,
    battery: undefined,
    newSalesStoppedByBattery: false,
    criticalBatteryAction: { kind: "unreadable" },
    ...overrides,
  });
}

describe("REGISTER_OWN_CONDITIONS", () => {
  it("names the revoked installation first, then the sales denial, the stopped fiscal emission, the silent register, the missing serial device, the low disk, the oversized WAL and the battery conditions", () => {
    expect(REGISTER_OWN_CONDITIONS).toEqual([
      "installation_revoked",
      "sales_denied",
      "fiscal_emission_stopped",
      "register_silent",
      "serial_device_missing",
      "disk_space_low",
      "wal_oversized",
      "battery_low",
      "on_battery",
      "battery_missing",
      "critical_battery_action_not_shutdown",
    ]);
  });

  it("names alert kinds besides the conditions the cloud does not raise as alerts", () => {
    const notAlerts = [
      "installation_revoked",
      "serial_device_missing",
      "disk_space_low",
      "wal_oversized",
      "battery_low",
      "on_battery",
      "battery_missing",
      "critical_battery_action_not_shutdown",
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

  it("holds sales_denied, naming the damaged local database as its reason, while the register keeps running with a damaged database", () => {
    expect(conditions({ localDatabaseDamaged: true })).toEqual([
      { kind: "sales_denied", reason: "local_database_damaged", level: "critical" },
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

  it("is given a storage standing every time, never none", () => {
    expectTypeOf<
      Parameters<typeof registerOwnConditions>[0]["storage"]
    >().toEqualTypeOf<StorageStanding>();
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

  it("names the startup shortage over a full disk when both hold, and holds the full disk as low", () => {
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
      { kind: "disk_space_low", level: "warning" },
    ]);
  });

  it("names a persisted stop's reason over a storage one, and holds the full disk as low", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: "event_history_broken" },
        storage: { ...HEALTHY_STORAGE, diskStanding: "full", diskFreeRatio: 0.03 },
      }),
    ).toEqual([
      { kind: "sales_denied", reason: "event_history_broken", level: "critical" },
      { kind: "disk_space_low", level: "warning" },
    ]);
  });

  it("holds installation_revoked for a revoked installation, and a full disk as low", () => {
    expect(
      conditions({
        salesStop: { stopped: true, reason: "installation_revoked" },
        storage: { ...HEALTHY_STORAGE, diskStanding: "full", diskFreeRatio: 0.03 },
      }),
    ).toEqual([
      { kind: "installation_revoked", level: "critical" },
      { kind: "disk_space_low", level: "warning" },
    ]);
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

describe("registerOwnConditions for the battery", () => {
  it("holds battery_low as a warning with the charge while on battery below 20 percent", () => {
    expect(conditions({ battery: onBatteryAt(15) })).toEqual([
      { kind: "battery_low", charge_percent: 15, critical_percent: 10, level: "warning" },
    ]);
  });

  it("holds battery_low at 10 percent and not at 20", () => {
    expect(conditions({ battery: onBatteryAt(10) })).toEqual([
      { kind: "battery_low", charge_percent: 10, critical_percent: 10, level: "warning" },
    ]);
    expect(conditions({ battery: onBatteryAt(20) })).toEqual([]);
  });

  it("holds nothing of a register on mains power, whatever the charge", () => {
    expect(conditions({ battery: onMainsAt(3) })).toEqual([]);
  });

  it("holds sales_denied while the battery stops new sales, whatever the report says", () => {
    expect(conditions({ newSalesStoppedByBattery: true, battery: onBatteryAt(9) })).toEqual([
      { kind: "sales_denied", reason: "battery_critical", level: "critical" },
    ]);
    expect(conditions({ newSalesStoppedByBattery: true, battery: undefined })).toEqual([
      { kind: "sales_denied", reason: "battery_critical", level: "critical" },
    ]);
  });

  it("holds no sales_denied for a critical report while the battery does not stop new sales", () => {
    expect(conditions({ battery: onBatteryAt(9) })).toEqual([]);
  });

  it("names a damaged local database over the battery stopping new sales", () => {
    expect(conditions({ newSalesStoppedByBattery: true, localDatabaseDamaged: true })).toEqual([
      { kind: "sales_denied", reason: "local_database_damaged", level: "critical" },
    ]);
  });

  it("holds on_battery as critical, with the minutes it takes, from 10 whole minutes on battery", () => {
    expect(conditions({ battery: onBatteryAt(80, 10) })).toEqual([
      { kind: "on_battery", threshold_minutes: 10, level: "critical" },
    ]);
  });

  it("does not hold on_battery before 10 whole minutes or on mains power", () => {
    expect(conditions({ battery: onBatteryAt(80, 9) })).toEqual([]);
    expect(conditions({ battery: onMainsAt(80) })).toEqual([]);
  });

  it("holds battery_missing as a warning when the register reports no battery", () => {
    expect(conditions({ battery: { present: false } })).toEqual([
      { kind: "battery_missing", level: "warning" },
    ]);
  });

  it("holds no battery condition while the battery cannot be read", () => {
    expect(conditions({ battery: undefined })).toEqual([]);
  });

  it("holds critical_battery_action_not_shutdown as a warning unless Windows shuts down or it could not be read", () => {
    for (const action of ["do_nothing", "sleep", "hibernate"] as const) {
      expect(conditions({ criticalBatteryAction: { kind: "read", action } })).toEqual([
        { kind: "critical_battery_action_not_shutdown", level: "warning" },
      ]);
    }
    expect(conditions({ criticalBatteryAction: { kind: "read", action: "shut_down" } })).toEqual(
      [],
    );
    expect(conditions({ criticalBatteryAction: { kind: "unreadable" } })).toEqual([]);
  });

  it("lists the battery conditions after the storage ones, in catalog order", () => {
    expect(
      conditions({
        storage: { ...HEALTHY_STORAGE, walOversized: true },
        battery: onBatteryAt(15, 30),
        criticalBatteryAction: { kind: "read", action: "sleep" },
      }),
    ).toEqual([
      { kind: "wal_oversized", level: "warning" },
      { kind: "battery_low", charge_percent: 15, critical_percent: 10, level: "warning" },
      { kind: "on_battery", threshold_minutes: 10, level: "critical" },
      { kind: "critical_battery_action_not_shutdown", level: "warning" },
    ]);
  });
});

describe("batteryConditionsOf", () => {
  it("names the battery conditions a report holds, with what each one shows", () => {
    expect(batteryConditionsOf(onBatteryAt(15, 30))).toEqual({
      battery_low: { kind: "battery_low", charge_percent: 15, critical_percent: 10 },
      on_battery: { kind: "on_battery", threshold_minutes: 10 },
      battery_missing: null,
    });
    expect(batteryConditionsOf({ present: false })).toEqual({
      battery_low: null,
      on_battery: null,
      battery_missing: { kind: "battery_missing" },
    });
  });

  it("names none for a battery that cannot be read or a register on mains power", () => {
    const none = { battery_low: null, on_battery: null, battery_missing: null };

    expect(batteryConditionsOf(undefined)).toEqual(none);
    expect(batteryConditionsOf(onMainsAt(3))).toEqual(none);
  });
});
