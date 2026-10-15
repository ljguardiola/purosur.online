import { OFFSITE_DUMP_FAILURE_REASONS } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type OffsiteDumpCheckRecorded,
  offsiteDumpCheckRecordedSchema,
} from "./offsite-dump-check-recorded.js";

const verified = { night: "2026-10-14", status: "verified", sizeBytes: 123_456 };
const failed = { night: "2026-10-14", status: "failed", reason: "hash_mismatch" };

describe("offsiteDumpCheckRecordedSchema", () => {
  it("describes a verified night with the dump's size", () => {
    expect(offsiteDumpCheckRecordedSchema.parse(verified)).toEqual(verified);
  });

  it.each(OFFSITE_DUMP_FAILURE_REASONS)("describes a failed night for %s", (reason) => {
    expect(offsiteDumpCheckRecordedSchema.parse({ ...failed, reason })).toEqual({
      ...failed,
      reason,
    });
  });

  it.each([
    ["a verified night without a size", { night: "2026-10-14", status: "verified" }],
    ["a failed night without a reason", { night: "2026-10-14", status: "failed" }],
    ["an unknown status", { ...verified, status: "passed" }],
    ["an unknown reason", { ...failed, reason: "disk_full" }],
    ["a night that is not a calendar day", { ...verified, night: "2026-02-30" }],
  ])("refuses %s", (_case, body) => {
    expect(offsiteDumpCheckRecordedSchema.safeParse(body).success).toBe(false);
  });

  it("is typed as the verified or failed night", () => {
    expectTypeOf<OffsiteDumpCheckRecorded>().toEqualTypeOf<
      | { night: string; status: "verified"; sizeBytes: number }
      | { night: string; status: "failed"; reason: (typeof OFFSITE_DUMP_FAILURE_REASONS)[number] }
    >();
  });
});
