import { describe, expect, it } from "vitest";
import {
  isAwaitingSnapshotVerification,
  isPastSnapshotUploadDeadline,
  isRetainedSnapshotGeneration,
  SNAPSHOT_CORRUPTION_STAGES,
  SNAPSHOT_DOWNLOAD_URL_LIFETIME_MS,
  SNAPSHOT_FAILURE_REASONS,
  SNAPSHOT_GENERATION_STATUSES,
  SNAPSHOT_RETENTION_INTERVAL_MS,
  SNAPSHOT_STATUSES_AWAITING_VERIFICATION,
  SNAPSHOT_STATUSES_RETAINED,
  SNAPSHOT_UPLOAD_DEADLINE_MS,
  SNAPSHOT_VERIFICATION_INTERVAL_MS,
  SNAPSHOT_WORKER_TIME_LIMIT_MS,
  snapshotUploadUrlLifetimeSeconds,
} from "./snapshot-generation.js";

const CREATED_AT = new Date("2026-10-14T12:00:00.000Z");

describe("snapshot generation", () => {
  it("names the stages at which a register finds its database corrupt", () => {
    expect(SNAPSHOT_CORRUPTION_STAGES).toEqual(["copy", "integrity_check", "foreign_key_check"]);
  });

  it("names the reasons a generation fails", () => {
    expect(SNAPSHOT_FAILURE_REASONS).toEqual(["hash_mismatch", "size_mismatch", "never_uploaded"]);
  });

  it("checks uploaded objects every minute and applies retention every 15 minutes", () => {
    expect(SNAPSHOT_VERIFICATION_INTERVAL_MS).toBe(60 * 1000);
    expect(SNAPSHOT_RETENTION_INTERVAL_MS).toBe(15 * 60 * 1000);
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

  it("lets an upload URL live 15 minutes when the deadline is further away", () => {
    expect(snapshotUploadUrlLifetimeSeconds(CREATED_AT, CREATED_AT)).toBe(900);
  });

  it("stops a snapshot worker 60 seconds after it starts", () => {
    expect(SNAPSHOT_WORKER_TIME_LIMIT_MS).toBe(60 * 1000);
  });

  it("ends an upload URL early enough for an upload begun with it to finish before the deadline", () => {
    expect(snapshotUploadUrlLifetimeSeconds(CREATED_AT, new Date("2026-10-14T12:45:00.000Z"))).toBe(
      840,
    );
    expect(snapshotUploadUrlLifetimeSeconds(CREATED_AT, new Date("2026-10-14T12:58:00.000Z"))).toBe(
      60,
    );
  });

  it("lets an upload URL live only the whole seconds left before it has to end", () => {
    expect(snapshotUploadUrlLifetimeSeconds(CREATED_AT, new Date("2026-10-14T12:58:58.500Z"))).toBe(
      1,
    );
  });

  it("authorizes no upload URL once less than a whole second would be left", () => {
    expect(
      snapshotUploadUrlLifetimeSeconds(CREATED_AT, new Date("2026-10-14T12:58:59.500Z")),
    ).toBeUndefined();
  });

  it("authorizes no upload URL once an upload begun now could outlast the deadline", () => {
    expect(
      snapshotUploadUrlLifetimeSeconds(CREATED_AT, new Date("2026-10-14T12:59:00.000Z")),
    ).toBeUndefined();
  });

  it("authorizes no upload URL once the upload deadline is reached", () => {
    expect(
      snapshotUploadUrlLifetimeSeconds(CREATED_AT, new Date("2026-10-14T13:00:00.000Z")),
    ).toBeUndefined();
    expect(
      snapshotUploadUrlLifetimeSeconds(CREATED_AT, new Date("2026-10-14T14:00:00.000Z")),
    ).toBeUndefined();
  });

  it("lets a download URL live 15 minutes", () => {
    expect(SNAPSHOT_DOWNLOAD_URL_LIFETIME_MS).toBe(15 * 60 * 1000);
  });

  it.each([
    ["declared", true],
    ["uploaded", true],
    ["verified", false],
    ["failed", false],
  ] as const)("judges a %s generation awaiting verification: %s", (status, awaiting) => {
    expect(isAwaitingSnapshotVerification(status)).toBe(awaiting);
  });

  it("lists exactly the statuses awaiting verification", () => {
    expect(
      SNAPSHOT_GENERATION_STATUSES.filter((status) => isAwaitingSnapshotVerification(status)),
    ).toEqual([...SNAPSHOT_STATUSES_AWAITING_VERIFICATION]);
  });

  it.each([
    ["declared", false, true],
    ["uploaded", false, true],
    ["verified", false, true],
    ["failed", false, false],
    ["verified", true, false],
    ["declared", true, false],
  ] as const)(
    "judges a %s generation, pruned: %s, retained by the cloud: %s",
    (status, pruned, retained) => {
      expect(isRetainedSnapshotGeneration({ status, pruned })).toBe(retained);
    },
  );

  it("lists exactly the statuses of a generation the cloud retains until it is pruned", () => {
    expect(
      SNAPSHOT_GENERATION_STATUSES.filter((status) =>
        isRetainedSnapshotGeneration({ status, pruned: false }),
      ),
    ).toEqual([...SNAPSHOT_STATUSES_RETAINED]);
  });
});
