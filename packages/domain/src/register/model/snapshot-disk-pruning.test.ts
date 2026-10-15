import { describe, expect, it } from "vitest";
import type { LocalSnapshotGeneration } from "./local-snapshot-generation.js";
import { snapshotDiskPruningPlan } from "./snapshot-disk-pruning.js";

const GIGABYTE = 1024 * 1024 * 1024;
const PLENTY = { diskFreeBytes: 100 * GIGABYTE, diskFreeRatio: 0.5 };
const BELOW_TWENTY_PERCENT = { diskFreeBytes: 100 * GIGABYTE, diskFreeRatio: 0.15 };
const BELOW_FIVE_GIGABYTES = { diskFreeBytes: 4 * GIGABYTE, diskFreeRatio: 0.5 };
const BELOW_TEN_PERCENT = { diskFreeBytes: 100 * GIGABYTE, diskFreeRatio: 0.09 };
const BELOW_TWO_GIGABYTES = { diskFreeBytes: 1.5 * GIGABYTE, diskFreeRatio: 0.5 };
const BELOW_FIVE_PERCENT = { diskFreeBytes: 100 * GIGABYTE, diskFreeRatio: 0.04 };
const UPLOADED_AT = new Date("2026-10-15T20:00:00.000Z");

function generation(
  hour: number,
  state: "pending" | "uploaded" | "refused",
): LocalSnapshotGeneration {
  return {
    generationId: `00000000-0000-4000-8000-${String(hour).padStart(12, "0")}`,
    createdAt: new Date(Date.UTC(2026, 9, 15, hour)),
    sequences: { lastDeviceSeq: hour, pullCursor: hour },
    keyVersion: 1,
    size: 10,
    sha256: "ab".repeat(32),
    uploadedAt: state === "uploaded" ? UPLOADED_AT : null,
    refusedAt: state === "refused" ? UPLOADED_AT : null,
  };
}

function hoursOf(generations: readonly LocalSnapshotGeneration[]): number[] {
  return generations.map((kept) => kept.createdAt.getUTCHours()).sort((a, b) => a - b);
}

function uploadedHours(hours: readonly number[]): LocalSnapshotGeneration[] {
  return hours.map((hour) => generation(hour, "uploaded"));
}

describe("snapshotDiskPruningPlan with room on the disk", () => {
  it("leaves the uploaded generations beyond the last six to the cloud's verification", () => {
    const plan = snapshotDiskPruningPlan(uploadedHours([1, 2, 3, 4, 5, 6, 7, 8, 9]), PLENTY);

    expect(hoursOf(plan.removeIfVerified)).toEqual([2, 3]);
    expect(plan.remove).toEqual([]);
  });

  it("counts not-yet-uploaded generations among the last six", () => {
    const plan = snapshotDiskPruningPlan(
      [
        ...uploadedHours([1, 2, 3, 4]),
        ...[5, 6, 7, 8, 9, 10].map((hour) => generation(hour, "pending")),
      ],
      PLENTY,
    );

    expect(hoursOf(plan.removeIfVerified)).toEqual([2, 3, 4]);
  });

  it("never offers a generation that was not uploaded, however old", () => {
    const plan = snapshotDiskPruningPlan(
      [
        generation(1, "uploaded"),
        generation(2, "pending"),
        generation(3, "refused"),
        ...uploadedHours([4, 5, 6, 7, 8, 9, 10]),
      ],
      PLENTY,
    );

    expect(hoursOf(plan.removeIfVerified)).toEqual([4]);
  });

  it("offers nothing while the disk holds no more than six generations", () => {
    expect(snapshotDiskPruningPlan(uploadedHours([1, 2, 3, 4, 5, 6]), PLENTY)).toEqual({
      remove: [],
      removeIfVerified: [],
    });
  });

  it("keeps the oldest generation on disk even when it was uploaded", () => {
    const plan = snapshotDiskPruningPlan(uploadedHours([1, 2, 3, 4, 5, 6, 7]), PLENTY);

    expect(plan.removeIfVerified).toEqual([]);
  });

  it("reads the generations in any order", () => {
    const plan = snapshotDiskPruningPlan(uploadedHours([5, 1, 8, 3, 7, 2, 6, 4]), PLENTY);

    expect(hoursOf(plan.removeIfVerified)).toEqual([2]);
  });

  it("orders generations created at the same instant by their id", () => {
    const smallerId = generation(1, "uploaded");
    const largerId = { ...smallerId, generationId: "00000000-0000-4000-8000-100000000001" };

    const plan = snapshotDiskPruningPlan(
      [largerId, smallerId, ...uploadedHours([2, 3, 4, 5, 6, 7])],
      PLENTY,
    );

    expect(plan.removeIfVerified).toEqual([largerId]);
  });
});

describe("snapshotDiskPruningPlan below 20% or 5 GB free", () => {
  it.each([
    ["20%", BELOW_TWENTY_PERCENT],
    ["5 GB", BELOW_FIVE_GIGABYTES],
  ])("prunes verified generations down to the last six below %s", (_, storage) => {
    const plan = snapshotDiskPruningPlan(uploadedHours([1, 2, 3, 4, 5, 6, 7, 8, 9]), storage);

    expect(hoursOf(plan.removeIfVerified)).toEqual([2, 3]);
    expect(plan.remove).toEqual([]);
  });
});

describe("snapshotDiskPruningPlan below 10% or 2 GB free", () => {
  it.each([
    ["10%", BELOW_TEN_PERCENT],
    ["2 GB", BELOW_TWO_GIGABYTES],
    ["5%", BELOW_FIVE_PERCENT],
  ])(
    "removes every uploaded generation but the newest and the oldest below %s, verified or not",
    (_, storage) => {
      const plan = snapshotDiskPruningPlan(
        [
          ...uploadedHours([1, 2, 3]),
          generation(4, "pending"),
          generation(5, "refused"),
          ...uploadedHours([6, 7, 8]),
          generation(9, "pending"),
          generation(10, "pending"),
        ],
        storage,
      );

      expect(hoursOf(plan.remove)).toEqual([2, 3, 6, 7]);
      expect(plan.removeIfVerified).toEqual([]);
    },
  );

  it("keeps the oldest generation on disk when it is also the only one uploaded", () => {
    expect(
      snapshotDiskPruningPlan(
        [generation(1, "uploaded"), generation(2, "pending"), generation(3, "pending")],
        BELOW_TEN_PERCENT,
      ),
    ).toEqual({ remove: [], removeIfVerified: [] });
  });

  it("removes nothing when no generation was uploaded", () => {
    expect(
      snapshotDiskPruningPlan(
        [generation(1, "pending"), generation(2, "pending"), generation(3, "pending")],
        BELOW_TEN_PERCENT,
      ),
    ).toEqual({ remove: [], removeIfVerified: [] });
  });

  it("removes nothing from an empty disk", () => {
    expect(snapshotDiskPruningPlan([], BELOW_TEN_PERCENT)).toEqual({
      remove: [],
      removeIfVerified: [],
    });
  });
});
