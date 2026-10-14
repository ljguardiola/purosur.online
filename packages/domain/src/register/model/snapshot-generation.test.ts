import { describe, expect, it } from "vitest";
import {
  isPastSnapshotUploadDeadline,
  SNAPSHOT_CORRUPTION_STAGES,
  SNAPSHOT_FAILURE_REASONS,
  SNAPSHOT_UPLOAD_DEADLINE_MS,
} from "./snapshot-generation.js";

const CREATED_AT = new Date("2026-10-14T12:00:00.000Z");

describe("snapshot generation", () => {
  it("names the stages at which a register finds its database corrupt", () => {
    expect(SNAPSHOT_CORRUPTION_STAGES).toEqual(["copy", "integrity_check", "foreign_key_check"]);
  });

  it("names the reasons a generation fails", () => {
    expect(SNAPSHOT_FAILURE_REASONS).toEqual(["hash_mismatch", "size_mismatch", "never_uploaded"]);
  });

  it("waits one hour for an object to appear", () => {
    expect(SNAPSHOT_UPLOAD_DEADLINE_MS).toBe(60 * 60 * 1000);
  });

  it("is within the upload deadline until an hour after it was declared", () => {
    const lastMoment = new Date(CREATED_AT.getTime() + SNAPSHOT_UPLOAD_DEADLINE_MS);
    expect(isPastSnapshotUploadDeadline(CREATED_AT, lastMoment)).toBe(false);
  });

  it("is past the upload deadline after an hour", () => {
    const afterwards = new Date(CREATED_AT.getTime() + SNAPSHOT_UPLOAD_DEADLINE_MS + 1);
    expect(isPastSnapshotUploadDeadline(CREATED_AT, afterwards)).toBe(true);
  });
});
