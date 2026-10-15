import { describe, expect, it } from "vitest";
import type { LocalSnapshotGeneration } from "../model/local-snapshot-generation.js";
import { pruneSnapshotGenerationsOnDisk } from "./prune-snapshot-generations-on-disk.js";
import {
  FakeSnapshotGenerationsOnDisk,
  FakeSnapshotVerificationCloud,
} from "./test-support/fake-snapshot-disk-pruning.js";

const GIGABYTE = 1024 ** 3;
const UPLOADED_AT = new Date("2026-10-15T20:00:00.000Z");

function idOf(hour: number): string {
  return `00000000-0000-4000-8000-${String(hour).padStart(12, "0")}`;
}

function generation(hour: number, uploaded = true): LocalSnapshotGeneration {
  return {
    generationId: idOf(hour),
    createdAt: new Date(Date.UTC(2026, 9, 15, hour)),
    sequences: { lastDeviceSeq: hour, pullCursor: hour },
    keyVersion: 1,
    size: 10,
    sha256: "ab".repeat(32),
    uploadedAt: uploaded ? UPLOADED_AT : null,
    refusedAt: null,
  };
}

function setup(hours: readonly number[]) {
  const disk = new FakeSnapshotGenerationsOnDisk();
  disk.hold(...hours.map((hour) => generation(hour)));
  const cloud = new FakeSnapshotVerificationCloud();
  const prune = () => pruneSnapshotGenerationsOnDisk({ disk, cloud });
  const heldHours = () => disk.held.map((held) => held.createdAt.getUTCHours()).sort((a, b) => a - b);
  return { disk, cloud, prune, heldHours };
}

describe("pruneSnapshotGenerationsOnDisk", () => {
  it("removes the generations beyond the last six that the cloud answers as verified", async () => {
    const { cloud, prune, heldHours } = setup([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    cloud.verified = new Set([idOf(2), idOf(4), idOf(9)]);

    const outcome = await prune();

    expect(cloud.asked).toEqual([[idOf(4), idOf(3), idOf(2)]]);
    expect(outcome).toEqual({ kind: "pruned", removed: [idOf(4), idOf(2)] });
    expect(heldHours()).toEqual([1, 3, 5, 6, 7, 8, 9, 10]);
  });

  it("keeps every generation the cloud did not answer for while it cannot reach it", async () => {
    const { cloud, prune, heldHours } = setup([1, 2, 3, 4, 5, 6, 7, 8]);
    cloud.verified = new Set([idOf(2)]);
    cloud.reachable = false;

    const outcome = await prune();

    expect(outcome).toEqual({ kind: "verification_unanswered", removed: [] });
    expect(heldHours()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("asks the cloud nothing while no generation depends on its answer", async () => {
    const { cloud, prune } = setup([1, 2, 3, 4, 5, 6, 7]);

    expect(await prune()).toEqual({ kind: "pruned", removed: [] });
    expect(cloud.asked).toEqual([]);
  });

  it("below 10% free removes every uploaded generation but the newest and the oldest without asking the cloud", async () => {
    const { disk, cloud, prune, heldHours } = setup([1, 2, 3, 4]);
    disk.hold(generation(5, false));
    disk.free = { diskFreeBytes: 100 * GIGABYTE, diskFreeRatio: 0.08 };
    cloud.reachable = false;

    const outcome = await prune();

    expect(outcome).toEqual({ kind: "pruned", removed: [idOf(3), idOf(2)] });
    expect(heldHours()).toEqual([1, 4, 5]);
    expect(cloud.asked).toEqual([]);
  });
});
