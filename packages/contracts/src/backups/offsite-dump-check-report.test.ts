import { OFFSITE_DUMP_REPORTED_FAILURE_REASONS } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type OffsiteDumpCheckReport,
  offsiteDumpCheckReportSchema,
} from "./offsite-dump-check-report.js";

const passed = { night: "2026-10-14", outcome: "passed", sizeBytes: 123_456 };
const failed = { night: "2026-10-14", outcome: "failed", reason: "hash_mismatch" };

function isAccepted(body: unknown): boolean {
  return offsiteDumpCheckReportSchema.safeParse(body).success;
}

describe("offsiteDumpCheckReportSchema", () => {
  it("accepts a passed check with the dump's size", () => {
    expect(offsiteDumpCheckReportSchema.parse(passed)).toEqual(passed);
  });

  it("accepts a passed check of an empty dump", () => {
    expect(isAccepted({ ...passed, sizeBytes: 0 })).toBe(true);
  });

  it.each(OFFSITE_DUMP_REPORTED_FAILURE_REASONS)("accepts a failed check for %s", (reason) => {
    expect(offsiteDumpCheckReportSchema.parse({ ...failed, reason })).toEqual({
      ...failed,
      reason,
    });
  });

  it("refuses the reason the domain decides itself", () => {
    expect(isAccepted({ ...failed, reason: "shrank" })).toBe(false);
  });

  it.each([
    ["a night that is not a calendar day", { ...passed, night: "2026-02-30" }],
    ["a night with a time", { ...passed, night: "2026-10-14T06:00:00Z" }],
    ["a night missing", { outcome: "passed", sizeBytes: 1 }],
    ["a size as text", { ...passed, sizeBytes: "10" }],
    ["a negative size", { ...passed, sizeBytes: -1 }],
    ["a fractional size", { ...passed, sizeBytes: 1.5 }],
    ["a passed check without a size", { night: "2026-10-14", outcome: "passed" }],
    ["a failed check without a reason", { night: "2026-10-14", outcome: "failed" }],
    ["an unknown outcome", { night: "2026-10-14", outcome: "skipped" }],
    ["an unknown reason", { ...failed, reason: "disk_full" }],
  ])("refuses %s", (_case, body) => {
    expect(isAccepted(body)).toBe(false);
  });

  it("tells a refused night to be written as a calendar day YYYY-MM-DD", () => {
    const result = offsiteDumpCheckReportSchema.safeParse({ ...passed, night: "14/10/2026" });

    expect(result.error?.issues.map((issue) => [issue.path, issue.message])).toEqual([
      [["night"], "night must be a calendar day written YYYY-MM-DD"],
    ]);
  });

  it("is typed as the passed or failed check of a night", () => {
    expectTypeOf<OffsiteDumpCheckReport>().toEqualTypeOf<
      | { night: string; outcome: "passed"; sizeBytes: number }
      | {
          night: string;
          outcome: "failed";
          reason: (typeof OFFSITE_DUMP_REPORTED_FAILURE_REASONS)[number];
        }
    >();
  });
});
