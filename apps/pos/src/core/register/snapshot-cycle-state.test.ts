import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SnapshotManifest } from "@purosur/contracts";
import type { BatteryReport } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CloudReachability } from "../sync/cloud-reachability";
import type { StorageReading } from "../sync/storage-telemetry";
import { createSnapshotCycleState } from "./snapshot-cycle-state";
import { writeManifest } from "./snapshot-generations-folder";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "snapshot-cycle-state-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function manifest(id: string, overrides: Partial<SnapshotManifest> = {}): SnapshotManifest {
  return {
    generation_id: id,
    created_at: "2026-10-15T12:00:00.000Z",
    last_device_seq: 1,
    pull_cursor: 2,
    key_version: 1,
    size: 10,
    sha256: "ab".repeat(32),
    uploaded_at: null,
    refused_at: null,
    ...overrides,
  };
}

const STORAGE: StorageReading = {
  database_size_bytes: 1000,
  wal_size_bytes: 300,
  disk_free_bytes: 5000,
  disk_free_ratio: 0.4,
};

function stateWith(
  options: { battery?: BatteryReport | undefined; reachability?: CloudReachability } = {},
) {
  return createSnapshotCycleState({
    snapshotsFolder: folder,
    sequences: () => ({ lastDeviceSeq: 9, pullCursor: 8 }),
    batteryReport: () => options.battery,
    readStorage: async () => STORAGE,
    cloudReachability: () => options.reachability ?? "reachable",
  });
}

describe("createSnapshotCycleState", () => {
  it("has no last generation while the folder holds none", async () => {
    expect(await stateWith().lastGeneration()).toBeUndefined();
  });

  it("answers the sequences of the newest generation in the folder", async () => {
    await writeManifest(
      folder,
      manifest("00000000-0000-4000-8000-000000000001", {
        created_at: "2026-10-15T11:00:00.000Z",
        last_device_seq: 3,
        pull_cursor: 4,
      }),
    );
    await writeManifest(
      folder,
      manifest("00000000-0000-4000-8000-000000000002", { last_device_seq: 7, pull_cursor: 8 }),
    );

    expect(await stateWith().lastGeneration()).toEqual({ lastDeviceSeq: 7, pullCursor: 8 });
  });

  it("counts a refused generation as the last one, so the register does not retake it forever", async () => {
    await writeManifest(
      folder,
      manifest("00000000-0000-4000-8000-000000000001", {
        refused_at: "2026-10-15T12:05:00.000Z",
        last_device_seq: 7,
        pull_cursor: 8,
      }),
    );

    expect(await stateWith().lastGeneration()).toEqual({ lastDeviceSeq: 7, pullCursor: 8 });
  });

  it("has no uploads pending while every generation was uploaded or refused", async () => {
    await writeManifest(
      folder,
      manifest("00000000-0000-4000-8000-000000000001", {
        uploaded_at: "2026-10-15T12:05:00.000Z",
      }),
    );
    await writeManifest(
      folder,
      manifest("00000000-0000-4000-8000-000000000002", { refused_at: "2026-10-15T12:05:00.000Z" }),
    );

    expect(await stateWith().hasPendingUploads()).toBe(false);
  });

  it("has uploads pending while a generation is neither uploaded nor refused", async () => {
    await writeManifest(folder, manifest("00000000-0000-4000-8000-000000000001"));

    expect(await stateWith().hasPendingUploads()).toBe(true);
  });

  it("answers the current sequences of the register", async () => {
    expect(await stateWith().currentSequences()).toEqual({ lastDeviceSeq: 9, pullCursor: 8 });
  });

  it("reads the storage the way the cycle wants it", async () => {
    expect(await stateWith().storage()).toEqual({
      diskFreeBytes: 5000,
      diskFreeRatio: 0.4,
      walSizeBytes: 300,
    });
  });

  describe("battery", () => {
    it("is unreadable until it was read", async () => {
      expect(await stateWith({ battery: undefined }).battery()).toEqual({ kind: "unreadable" });
    });

    it("is absent for a register without battery", async () => {
      expect(await stateWith({ battery: { present: false } }).battery()).toEqual({
        kind: "absent",
      });
    });

    it("carries the charge and whether it runs on the battery", async () => {
      const battery: BatteryReport = {
        present: true,
        charge_percent: 64,
        health_percent: 90,
        on_battery: true,
        on_battery_minutes: 12,
      };

      expect(await stateWith({ battery }).battery()).toEqual({
        kind: "present",
        chargePercent: 64,
        onBattery: true,
      });
    });
  });

  describe("cloudReachable", () => {
    it.each([
      ["reachable", true],
      ["unknown", true],
      ["unreachable", false],
    ] as const)("is %s when the cloud was last seen %s", async (reachability, expected) => {
      expect(await stateWith({ reachability }).cloudReachable()).toBe(expected);
    });
  });
});
