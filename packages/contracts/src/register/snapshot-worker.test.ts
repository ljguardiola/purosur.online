import { describe, expect, it } from "vitest";
import { snapshotWorkerJobSchema, snapshotWorkerLaunchSchema } from "./snapshot-worker.js";

const KEY = Buffer.alloc(32, 7).toString("base64");

const TAKE = {
  kind: "take",
  register_id: "7d2f6c5e-1b0a-4f43-9a52-3c7d8e9f0a11",
  generation_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  key: { version: 2, key: KEY },
  device_token: "prefix.secret",
  cloud_url: "https://cloud.example.test",
  database_path: "/data/register.sqlite",
  snapshots_folder: "/data/snapshots",
  last_device_seq: 41,
  pull_cursor: 977,
};

const UPLOAD = {
  kind: "upload_pending",
  device_token: "prefix.secret",
  cloud_url: "https://cloud.example.test",
  snapshots_folder: "/data/snapshots",
};

describe("snapshotWorkerJobSchema", () => {
  it("reads a job that takes a snapshot", () => {
    expect(snapshotWorkerJobSchema.parse(TAKE)).toEqual(TAKE);
  });

  it("reads a job that only uploads", () => {
    expect(snapshotWorkerJobSchema.parse(UPLOAD)).toEqual(UPLOAD);
  });

  it("accepts sequences of zero", () => {
    expect(
      snapshotWorkerJobSchema.safeParse({ ...TAKE, last_device_seq: 0, pull_cursor: 0 }).success,
    ).toBe(true);
  });

  it.each([
    ["a register id that is not a uuid", { register_id: "register-1" }],
    ["a generation id that is not a uuid", { generation_id: "../generation" }],
    ["a generation id that climbs out of the folder", { generation_id: "../../x" }],
    ["a key that is not 32 bytes", { key: { version: 2, key: "c2hvcnQ=" } }],
    ["a key version of zero", { key: { version: 0, key: KEY } }],
    ["an empty device token", { device_token: "" }],
    ["a cloud url that is not a url", { cloud_url: "cloud" }],
    ["an empty database path", { database_path: "" }],
    ["an empty snapshots folder", { snapshots_folder: "" }],
    ["a negative local sequence", { last_device_seq: -1 }],
    ["a fractional local sequence", { last_device_seq: 1.5 }],
    ["a negative cloud sequence", { pull_cursor: -1 }],
    ["a fractional cloud sequence", { pull_cursor: 0.5 }],
    ["a field it does not know", { extra: true }],
  ])("refuses a take job with %s", (_name, override) => {
    expect(snapshotWorkerJobSchema.safeParse({ ...TAKE, ...override }).success).toBe(false);
  });

  it.each(Object.keys(TAKE).filter((field) => field !== "kind"))(
    "requires %s in a take job",
    (field) => {
      const { [field]: _omitted, ...rest } = TAKE as Record<string, unknown>;

      expect(snapshotWorkerJobSchema.safeParse(rest).success).toBe(false);
    },
  );

  it.each(Object.keys(UPLOAD).filter((field) => field !== "kind"))(
    "requires %s in an upload job",
    (field) => {
      const { [field]: _omitted, ...rest } = UPLOAD as Record<string, unknown>;

      expect(snapshotWorkerJobSchema.safeParse(rest).success).toBe(false);
    },
  );

  it("refuses an upload job that carries a take job's fields", () => {
    expect(
      snapshotWorkerJobSchema.safeParse({ ...UPLOAD, generation_id: TAKE.generation_id }).success,
    ).toBe(false);
  });

  it("refuses a job of another kind", () => {
    expect(snapshotWorkerJobSchema.safeParse({ ...UPLOAD, kind: "restore" }).success).toBe(false);
  });
});

describe("snapshotWorkerLaunchSchema", () => {
  const LAUNCH = { type: "launch-snapshot-worker", time_limit_ms: 60_000, job: TAKE };

  it("reads a request to launch a worker", () => {
    expect(snapshotWorkerLaunchSchema.parse(LAUNCH)).toEqual(LAUNCH);
  });

  it.each([
    ["a time limit of zero", { time_limit_ms: 0 }],
    ["a negative time limit", { time_limit_ms: -1 }],
    ["a fractional time limit", { time_limit_ms: 1.5 }],
    ["another type", { type: "launch-core" }],
    ["an invalid job", { job: { kind: "take" } }],
  ])("refuses %s", (_name, override) => {
    expect(snapshotWorkerLaunchSchema.safeParse({ ...LAUNCH, ...override }).success).toBe(false);
  });

  it.each(["time_limit_ms", "job"])("requires %s", (field) => {
    const { [field]: _omitted, ...rest } = LAUNCH as Record<string, unknown>;

    expect(snapshotWorkerLaunchSchema.safeParse(rest).success).toBe(false);
  });
});
