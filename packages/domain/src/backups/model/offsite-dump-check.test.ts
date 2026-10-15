import { describe, expect, it } from "vitest";
import {
  classifyOffsiteDumpCheck,
  OFFSITE_DUMP_FAILURE_REASONS,
  OFFSITE_DUMP_REPORTED_FAILURE_REASONS,
  OFFSITE_DUMP_SHRINK_THRESHOLD_PERCENT,
} from "./offsite-dump-check.js";

describe("offsite dump failure reasons", () => {
  it("lists the reasons the check reports and the one the domain decides", () => {
    expect(OFFSITE_DUMP_REPORTED_FAILURE_REASONS).toEqual([
      "object_missing",
      "manifest_missing",
      "size_mismatch",
      "hash_mismatch",
      "decryption_failed",
      "archive_unreadable",
    ]);
    expect(OFFSITE_DUMP_FAILURE_REASONS).toEqual([
      ...OFFSITE_DUMP_REPORTED_FAILURE_REASONS,
      "shrank",
    ]);
  });
});

describe("classifyOffsiteDumpCheck", () => {
  it("keeps the reason of a failed check", () => {
    expect(classifyOffsiteDumpCheck({ outcome: "failed", reason: "hash_mismatch" }, 1_000)).toEqual(
      { status: "failed", reason: "hash_mismatch" },
    );
  });

  it("verifies a passed check with no earlier night of known size", () => {
    expect(classifyOffsiteDumpCheck({ outcome: "passed", sizeBytes: 1 }, undefined)).toEqual({
      status: "verified",
      sizeBytes: 1,
    });
  });

  it("states the threshold as half the earlier size", () => {
    expect(OFFSITE_DUMP_SHRINK_THRESHOLD_PERCENT).toBe(50);
  });

  it("verifies a dump of exactly half the earlier size", () => {
    expect(classifyOffsiteDumpCheck({ outcome: "passed", sizeBytes: 500 }, 1_000)).toEqual({
      status: "verified",
      sizeBytes: 500,
    });
  });

  it("fails as shrank a dump below half the earlier size, keeping its size", () => {
    expect(classifyOffsiteDumpCheck({ outcome: "passed", sizeBytes: 499 }, 1_000)).toEqual({
      status: "failed",
      reason: "shrank",
      sizeBytes: 499,
    });
  });

  it("compares against an odd earlier size without rounding", () => {
    expect(classifyOffsiteDumpCheck({ outcome: "passed", sizeBytes: 500 }, 1_001)).toEqual({
      status: "failed",
      reason: "shrank",
      sizeBytes: 500,
    });
    expect(classifyOffsiteDumpCheck({ outcome: "passed", sizeBytes: 501 }, 1_001)).toEqual({
      status: "verified",
      sizeBytes: 501,
    });
  });

  it("verifies a dump bigger than the earlier one", () => {
    expect(classifyOffsiteDumpCheck({ outcome: "passed", sizeBytes: 5_000 }, 1_000)).toEqual({
      status: "verified",
      sizeBytes: 5_000,
    });
  });
});
