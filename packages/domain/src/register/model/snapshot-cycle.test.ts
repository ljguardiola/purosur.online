import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_BATTERY_FLOOR_PERCENT,
  SNAPSHOT_INTERVAL_OFFLINE_MS,
  SNAPSHOT_INTERVAL_ONLINE_MS,
  type SnapshotCycleFacts,
  snapshotCycleDecision,
  snapshotIntervalMs,
} from "./snapshot-cycle.js";

const GIGABYTE = 1024 * 1024 * 1024;
const MEGABYTE = 1024 * 1024;

function facts(overrides: Partial<SnapshotCycleFacts> = {}): SnapshotCycleFacts {
  return {
    lastGeneration: { lastDeviceSeq: 10, pullCursor: 20 },
    current: { lastDeviceSeq: 11, pullCursor: 20 },
    battery: { kind: "absent" },
    storage: { diskFreeBytes: 100 * GIGABYTE, diskFreeRatio: 0.5, walSizeBytes: 0 },
    pendingUploads: false,
    cloudReachable: true,
    localDatabaseDamaged: false,
    ...overrides,
  };
}

describe("snapshotIntervalMs", () => {
  it("is five minutes with internet", () => {
    expect(SNAPSHOT_INTERVAL_ONLINE_MS).toBe(5 * 60 * 1000);
    expect(snapshotIntervalMs(true)).toBe(5 * 60 * 1000);
  });

  it("is thirty minutes without internet", () => {
    expect(SNAPSHOT_INTERVAL_OFFLINE_MS).toBe(30 * 60 * 1000);
    expect(snapshotIntervalMs(false)).toBe(30 * 60 * 1000);
  });
});

describe("snapshotCycleDecision", () => {
  it("takes a snapshot when the local sequence moved since the last generation", () => {
    expect(snapshotCycleDecision(facts())).toEqual({ kind: "take" });
  });

  it("takes a snapshot when only the applied cloud sequence moved", () => {
    expect(
      snapshotCycleDecision(facts({ current: { lastDeviceSeq: 10, pullCursor: 21 } })),
    ).toEqual({ kind: "take" });
  });

  it("takes the first snapshot when there is no generation yet", () => {
    expect(
      snapshotCycleDecision(
        facts({
          lastGeneration: undefined,
          current: { lastDeviceSeq: 0, pullCursor: 0 },
        }),
      ),
    ).toEqual({ kind: "take" });
  });

  it("skips an idle register whose sequences have not moved", () => {
    expect(
      snapshotCycleDecision(facts({ current: { lastDeviceSeq: 10, pullCursor: 20 } })),
    ).toEqual({ kind: "skip", reason: "unchanged" });
  });

  describe("a damaged local database", () => {
    it("takes no new snapshot even though the sequences moved", () => {
      expect(snapshotCycleDecision(facts({ localDatabaseDamaged: true }))).toEqual({
        kind: "skip",
        reason: "database_damaged",
      });
    });

    it("uploads the generations that wait when the cloud is reachable", () => {
      expect(
        snapshotCycleDecision(facts({ localDatabaseDamaged: true, pendingUploads: true })),
      ).toEqual({ kind: "upload_pending" });
    });

    it("takes no snapshot and uploads nothing when the cloud is unreachable", () => {
      expect(
        snapshotCycleDecision(
          facts({ localDatabaseDamaged: true, pendingUploads: true, cloudReachable: false }),
        ),
      ).toEqual({ kind: "skip", reason: "database_damaged" });
    });

    it("names the damage when the sequences did not move either", () => {
      expect(
        snapshotCycleDecision(
          facts({ localDatabaseDamaged: true, current: { lastDeviceSeq: 10, pullCursor: 20 } }),
        ),
      ).toEqual({ kind: "skip", reason: "database_damaged" });
    });

    it("names the damage over a low battery", () => {
      expect(
        snapshotCycleDecision(
          facts({
            localDatabaseDamaged: true,
            battery: { kind: "present", chargePercent: 1, onBattery: true },
          }),
        ),
      ).toEqual({ kind: "skip", reason: "database_damaged" });
    });
  });

  describe("battery", () => {
    it("refuses a new snapshot below the floor", () => {
      expect(SNAPSHOT_BATTERY_FLOOR_PERCENT).toBe(20);
      expect(
        snapshotCycleDecision(
          facts({ battery: { kind: "present", chargePercent: 19, onBattery: true } }),
        ),
      ).toEqual({ kind: "skip", reason: "battery_low" });
    });

    it("allows a new snapshot at exactly the floor", () => {
      expect(
        snapshotCycleDecision(
          facts({ battery: { kind: "present", chargePercent: 20, onBattery: true } }),
        ),
      ).toEqual({ kind: "take" });
    });

    it("refuses below the floor even while plugged in", () => {
      expect(
        snapshotCycleDecision(
          facts({ battery: { kind: "present", chargePercent: 5, onBattery: false } }),
        ),
      ).toEqual({ kind: "skip", reason: "battery_low" });
    });

    it("does not block when the battery cannot be read", () => {
      expect(snapshotCycleDecision(facts({ battery: { kind: "unreadable" } }))).toEqual({
        kind: "take",
      });
    });

    it("does not block a register without battery", () => {
      expect(snapshotCycleDecision(facts({ battery: { kind: "absent" } }))).toEqual({
        kind: "take",
      });
    });
  });

  describe("disk", () => {
    it("refuses a new snapshot with less than 10% of the disk free", () => {
      expect(
        snapshotCycleDecision(
          facts({
            storage: { diskFreeBytes: 100 * GIGABYTE, diskFreeRatio: 0.09, walSizeBytes: 0 },
          }),
        ),
      ).toEqual({ kind: "skip", reason: "disk_low" });
    });

    it("refuses a new snapshot with less than 2 GB free", () => {
      expect(
        snapshotCycleDecision(
          facts({
            storage: { diskFreeBytes: 2 * GIGABYTE - 1, diskFreeRatio: 0.5, walSizeBytes: 0 },
          }),
        ),
      ).toEqual({ kind: "skip", reason: "disk_low" });
    });

    it("refuses a new snapshot when the disk is full", () => {
      expect(
        snapshotCycleDecision(
          facts({ storage: { diskFreeBytes: 0, diskFreeRatio: 0, walSizeBytes: 0 } }),
        ),
      ).toEqual({ kind: "skip", reason: "disk_low" });
    });

    it("allows a new snapshot at exactly 10% and 2 GB free", () => {
      expect(
        snapshotCycleDecision(
          facts({
            storage: { diskFreeBytes: 2 * GIGABYTE, diskFreeRatio: 0.1, walSizeBytes: 0 },
          }),
        ),
      ).toEqual({ kind: "take" });
    });
  });

  describe("write-ahead log", () => {
    it("refuses a new snapshot while the log is over 256 MB", () => {
      expect(
        snapshotCycleDecision(
          facts({
            storage: {
              diskFreeBytes: 100 * GIGABYTE,
              diskFreeRatio: 0.5,
              walSizeBytes: 256 * MEGABYTE + 1,
            },
          }),
        ),
      ).toEqual({ kind: "skip", reason: "wal_oversized" });
    });

    it("allows a new snapshot with a log of exactly 256 MB", () => {
      expect(
        snapshotCycleDecision(
          facts({
            storage: {
              diskFreeBytes: 100 * GIGABYTE,
              diskFreeRatio: 0.5,
              walSizeBytes: 256 * MEGABYTE,
            },
          }),
        ),
      ).toEqual({ kind: "take" });
    });
  });

  it("names the battery first when several floors are crossed", () => {
    expect(
      snapshotCycleDecision(
        facts({
          battery: { kind: "present", chargePercent: 1, onBattery: true },
          storage: { diskFreeBytes: 0, diskFreeRatio: 0, walSizeBytes: GIGABYTE },
        }),
      ),
    ).toEqual({ kind: "skip", reason: "battery_low" });
  });

  it("names the disk before the log when both floors are crossed", () => {
    expect(
      snapshotCycleDecision(
        facts({ storage: { diskFreeBytes: 0, diskFreeRatio: 0, walSizeBytes: GIGABYTE } }),
      ),
    ).toEqual({ kind: "skip", reason: "disk_low" });
  });

  describe("generations not uploaded yet", () => {
    it("takes the new snapshot first when one is due", () => {
      expect(snapshotCycleDecision(facts({ pendingUploads: true }))).toEqual({ kind: "take" });
    });

    it("uploads them when nothing changed and the cloud is reachable", () => {
      expect(
        snapshotCycleDecision(
          facts({ pendingUploads: true, current: { lastDeviceSeq: 10, pullCursor: 20 } }),
        ),
      ).toEqual({ kind: "upload_pending" });
    });

    it("uploads them while a floor blocks the new snapshot", () => {
      expect(
        snapshotCycleDecision(
          facts({
            pendingUploads: true,
            battery: { kind: "present", chargePercent: 3, onBattery: true },
          }),
        ),
      ).toEqual({ kind: "upload_pending" });
    });

    it("keeps the reason of the skipped snapshot when the cloud is unreachable", () => {
      expect(
        snapshotCycleDecision(
          facts({
            pendingUploads: true,
            cloudReachable: false,
            battery: { kind: "present", chargePercent: 3, onBattery: true },
          }),
        ),
      ).toEqual({ kind: "skip", reason: "battery_low" });
    });

    it("skips as unchanged when nothing changed and the cloud is unreachable", () => {
      expect(
        snapshotCycleDecision(
          facts({
            pendingUploads: true,
            cloudReachable: false,
            current: { lastDeviceSeq: 10, pullCursor: 20 },
          }),
        ),
      ).toEqual({ kind: "skip", reason: "unchanged" });
    });

    it("does not need the cloud to take a new snapshot", () => {
      expect(snapshotCycleDecision(facts({ cloudReachable: false }))).toEqual({ kind: "take" });
    });
  });
});
