import { describe, expect, it } from "vitest";
import { OFFSITE_DUMP_UNVERIFIED_REASONS } from "./offsite-dump-unverified-reason.js";

describe("OFFSITE_DUMP_UNVERIFIED_REASONS", () => {
  it("is not reported at all, or any reason a dump check fails", () => {
    expect(OFFSITE_DUMP_UNVERIFIED_REASONS).toEqual([
      "not_reported",
      "object_missing",
      "manifest_missing",
      "size_mismatch",
      "hash_mismatch",
      "decryption_failed",
      "archive_unreadable",
      "shrank",
    ]);
  });
});
