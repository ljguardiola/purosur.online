import {
  ARGENTINA_TIME_ZONE,
  SNAPSHOT_FAILURE_REASONS,
  SNAPSHOT_LIFECYCLE_LIMITS,
  SNAPSHOT_LOCATIONS,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  snapshotBackupRegistersSchema,
  snapshotBackupsSchema,
  snapshotKeyRotationSchema,
  snapshotLifecycleRulesSchema,
} from "./snapshot-backups.js";

const GENERATION = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  created_at: "2026-10-14T12:00:00.000Z",
  size: 4096,
  status: "verified",
  failure_reason: null,
  key_version: 2,
  counts_for_restore: true,
  location: "disk_and_bucket",
};

const BACKUPS = {
  rules: { hourly: 24, daily: 30, monthly: 12 },
  tiers: { recent: 6, hourly: 10, daily: 8, monthly: 3 },
  recent_limit: 6,
  generations: [GENERATION],
};

describe("snapshotBackupRegistersSchema", () => {
  it("reads the registers a person can choose", () => {
    const body = { registers: [{ id: "register-1", name: "Caja 1" }] };
    expect(snapshotBackupRegistersSchema.parse(body)).toEqual(body);
  });

  it("reads an empty list", () => {
    expect(snapshotBackupRegistersSchema.parse({ registers: [] })).toEqual({ registers: [] });
  });
});

describe("snapshotBackupsSchema", () => {
  it("reads a register's rules, tier counts and generations", () => {
    expect(snapshotBackupsSchema.parse(BACKUPS)).toEqual(BACKUPS);
  });

  it("reads a register without generations", () => {
    const empty = { ...BACKUPS, generations: [] };
    expect(snapshotBackupsSchema.parse(empty)).toEqual(empty);
  });

  it.each(SNAPSHOT_FAILURE_REASONS)("reads a failed generation that failed by %s", (reason) => {
    const failed = {
      ...GENERATION,
      status: "failed",
      failure_reason: reason,
      counts_for_restore: false,
    };
    expect(snapshotBackupsSchema.parse({ ...BACKUPS, generations: [failed] }).generations).toEqual([
      failed,
    ]);
  });

  it.each(SNAPSHOT_LOCATIONS)("reads a generation kept at %s", (location) => {
    const placed = { ...GENERATION, location };
    expect(snapshotBackupsSchema.parse({ ...BACKUPS, generations: [placed] }).generations).toEqual([
      placed,
    ]);
  });

  it.each([
    ["a status that is not one of the generation's", { status: "lost" }],
    ["a location that is not known", { location: "cloud" }],
    ["a failure reason that is not known", { failure_reason: "cosmic_ray" }],
    ["a creation time that is not an instant", { created_at: "yesterday" }],
    ["a size of zero", { size: 0 }],
    ["a key version of zero", { key_version: 0 }],
    ["a generation id that is not a uuid", { id: "g1" }],
    ["a restore flag that is not a boolean", { counts_for_restore: "yes" }],
  ])("refuses a generation with %s", (_name, override) => {
    expect(
      snapshotBackupsSchema.safeParse({ ...BACKUPS, generations: [{ ...GENERATION, ...override }] })
        .success,
    ).toBe(false);
  });

  it.each([
    ["a negative count", { recent: -1, hourly: 0, daily: 0, monthly: 0 }],
    ["a fractional count", { recent: 1.5, hourly: 0, daily: 0, monthly: 0 }],
    ["a missing tier", { recent: 1, hourly: 0, daily: 0 }],
  ])("refuses tier counts with %s", (_name, tiers) => {
    expect(snapshotBackupsSchema.safeParse({ ...BACKUPS, tiers }).success).toBe(false);
  });

  it.each([
    ["zero", 0],
    ["a negative number", -1],
    ["a fractional number", 1.5],
    ["a string", "6"],
  ])("refuses a recent limit of %s", (_name, recent_limit) => {
    expect(snapshotBackupsSchema.safeParse({ ...BACKUPS, recent_limit }).success).toBe(false);
  });

  it("refuses a body without the recent limit", () => {
    const { recent_limit: _omitted, ...withoutLimit } = BACKUPS;
    expect(snapshotBackupsSchema.safeParse(withoutLimit).success).toBe(false);
  });
});

describe("snapshotLifecycleRulesSchema", () => {
  it("reads the smallest and the largest rules the domain allows", () => {
    const smallest = {
      hourly: SNAPSHOT_LIFECYCLE_LIMITS.hourly.min,
      daily: SNAPSHOT_LIFECYCLE_LIMITS.daily.min,
      monthly: SNAPSHOT_LIFECYCLE_LIMITS.monthly.min,
    };
    const largest = {
      hourly: SNAPSHOT_LIFECYCLE_LIMITS.hourly.max,
      daily: SNAPSHOT_LIFECYCLE_LIMITS.daily.max,
      monthly: SNAPSHOT_LIFECYCLE_LIMITS.monthly.max,
    };
    expect(snapshotLifecycleRulesSchema.parse(smallest)).toEqual(smallest);
    expect(snapshotLifecycleRulesSchema.parse(largest)).toEqual(largest);
  });

  it.each([
    ["hours below the minimum", { hourly: 0, daily: 30, monthly: 12 }],
    ["hours above the maximum", { hourly: 73, daily: 30, monthly: 12 }],
    ["days below the minimum", { hourly: 24, daily: 0, monthly: 12 }],
    ["days above the maximum", { hourly: 24, daily: 91, monthly: 12 }],
    ["months below the minimum", { hourly: 24, daily: 30, monthly: 0 }],
    ["months above the maximum", { hourly: 24, daily: 30, monthly: 25 }],
    ["a fractional number", { hourly: 24.5, daily: 30, monthly: 12 }],
    ["a missing field", { hourly: 24, daily: 30 }],
    ["an extra field", { hourly: 24, daily: 30, monthly: 12, yearly: 1 }],
  ])("refuses rules with %s", (_name, rules) => {
    expect(snapshotLifecycleRulesSchema.safeParse(rules).success).toBe(false);
  });
});

describe("snapshotKeyRotationSchema", () => {
  it("reads the version the register's key was rotated to", () => {
    expect(snapshotKeyRotationSchema.parse({ key_version: 3 })).toEqual({ key_version: 3 });
  });

  it("refuses a version of zero", () => {
    expect(snapshotKeyRotationSchema.safeParse({ key_version: 0 }).success).toBe(false);
  });
});

describe("snapshotBackupsSchema generations", () => {
  it("declares the zone a generation's creation is shown in", () => {
    expect(snapshotBackupsSchema.shape.generations.element.shape.created_at.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });
});
