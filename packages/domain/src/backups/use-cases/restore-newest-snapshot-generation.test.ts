import { describe, expect, it } from "vitest";
import { restoreNewestSnapshotGeneration } from "./restore-newest-snapshot-generation.js";
import {
  FakeRestorableGenerations,
  FakeSnapshotStaging,
  restorableGeneration,
} from "./test-support/fake-snapshot-restoration.js";

const oldest = restorableGeneration("generation-a", "2026-10-01T03:00:00.000Z");
const middle = restorableGeneration("generation-b", "2026-10-02T03:00:00.000Z");
const newest = restorableGeneration("generation-c", "2026-10-03T03:00:00.000Z");

function listing(...generations: ReturnType<typeof restorableGeneration>[]) {
  return new FakeRestorableGenerations({ kind: "listed", generations });
}

describe("restoreNewestSnapshotGeneration", () => {
  it("restores the newest generation by creation time whatever the order it was listed in", async () => {
    const staging = new FakeSnapshotStaging();

    const outcome = await restoreNewestSnapshotGeneration({
      generations: listing(middle, newest, oldest),
      staging,
    });

    expect(outcome).toEqual({ kind: "restored", generationId: "generation-c", failures: [] });
    expect(staging.attempted).toEqual(["generation-c"]);
  });

  it("falls back to the next newest generation when the newest fails, reporting the failure and its stage", async () => {
    const staging = new FakeSnapshotStaging({
      "generation-c": { kind: "failed", stage: "hash_mismatch" },
    });

    const outcome = await restoreNewestSnapshotGeneration({
      generations: listing(oldest, newest, middle),
      staging,
    });

    expect(outcome).toEqual({
      kind: "restored",
      generationId: "generation-b",
      failures: [{ generationId: "generation-c", stage: "hash_mismatch" }],
    });
    expect(staging.attempted).toEqual(["generation-c", "generation-b"]);
  });

  it("tries the generations newest first and reports every failure in that order", async () => {
    const staging = new FakeSnapshotStaging({
      "generation-c": { kind: "failed", stage: "decryption" },
      "generation-b": { kind: "failed", stage: "integrity_check" },
    });

    const outcome = await restoreNewestSnapshotGeneration({
      generations: listing(middle, oldest, newest),
      staging,
    });

    expect(outcome).toEqual({
      kind: "restored",
      generationId: "generation-a",
      failures: [
        { generationId: "generation-c", stage: "decryption" },
        { generationId: "generation-b", stage: "integrity_check" },
      ],
    });
  });

  it("stops at the first generation that stages and leaves the older ones alone", async () => {
    const staging = new FakeSnapshotStaging();

    await restoreNewestSnapshotGeneration({
      generations: listing(oldest, middle, newest),
      staging,
    });

    expect(staging.attempted).toEqual(["generation-c"]);
  });

  it("reports no generation when the register has nothing verified to restore", async () => {
    const staging = new FakeSnapshotStaging();

    const outcome = await restoreNewestSnapshotGeneration({ generations: listing(), staging });

    expect(outcome).toEqual({ kind: "no_generation" });
    expect(staging.attempted).toEqual([]);
  });

  it("reports none usable with every failure when every generation fails", async () => {
    const staging = new FakeSnapshotStaging({
      "generation-a": { kind: "failed", stage: "download" },
      "generation-b": { kind: "failed", stage: "missing_key_version" },
      "generation-c": { kind: "failed", stage: "foreign_key_check" },
    });

    const outcome = await restoreNewestSnapshotGeneration({
      generations: listing(oldest, newest, middle),
      staging,
    });

    expect(outcome).toEqual({
      kind: "none_usable",
      failures: [
        { generationId: "generation-c", stage: "foreign_key_check" },
        { generationId: "generation-b", stage: "missing_key_version" },
        { generationId: "generation-a", stage: "download" },
      ],
    });
  });

  it("reports unreachable when the generations could not be listed, trying none", async () => {
    const staging = new FakeSnapshotStaging();

    const outcome = await restoreNewestSnapshotGeneration({
      generations: new FakeRestorableGenerations({ kind: "unreachable" }),
      staging,
    });

    expect(outcome).toEqual({ kind: "unreachable" });
    expect(staging.attempted).toEqual([]);
  });
});
