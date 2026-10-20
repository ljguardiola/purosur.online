import type { SnapshotWorkerJobMessage } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { runRestoreJob as RunRestoreJob } from "./backups/run-restore-job";
import type {
  runSnapshotJob as RunSnapshotJob,
  SnapshotJobResult,
} from "./register/run-snapshot-job";

const runSnapshotJob = vi.hoisted(() => vi.fn<typeof RunSnapshotJob>());
const runRestoreJob = vi.hoisted(() => vi.fn<typeof RunRestoreJob>());

vi.mock("electron", () => ({ net: { fetch: vi.fn() } }));
vi.mock("./register/run-snapshot-job", () => ({ runSnapshotJob }));
vi.mock("./backups/run-restore-job", () => ({ runRestoreJob }));

const UPLOAD_JOB: SnapshotWorkerJobMessage = {
  kind: "upload_pending",
  device_token: "prefix.secret",
  cloud_url: "https://cloud.example.test",
  snapshots_folder: "/data/snapshots",
};

const RESTORE_JOB: SnapshotWorkerJobMessage = {
  kind: "restore",
  device_token: "prefix.secret",
  cloud_url: "https://cloud.example.test",
  staged_database_path: "/data/register.restored.sqlite",
  snapshot_keys: [{ version: 1, key: Buffer.alloc(32, 1).toString("base64") }],
};

class ProcessExited extends Error {}

let deliver: (data: unknown) => void;
let delivering = false;
let exited: Promise<number>;
let posted: Promise<unknown>;

beforeEach(async () => {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  let resolveExit: (code: number) => void = () => {};
  exited = new Promise((resolve) => {
    resolveExit = resolve;
  });
  vi.spyOn(process, "exit").mockImplementation((code) => {
    resolveExit(Number(code));
    if (delivering) {
      throw new ProcessExited(`exited with ${code}`);
    }
    return undefined as never;
  });
  let resolvePosted: (message: unknown) => void = () => {};
  posted = new Promise((resolve) => {
    resolvePosted = resolve;
  });
  let listener: (event: { data: unknown }) => void = () => {};
  Object.defineProperty(process, "parentPort", {
    configurable: true,
    value: {
      once: (_event: string, handle: (event: { data: unknown }) => void) => {
        listener = handle;
      },
      postMessage: resolvePosted,
    },
  });
  deliver = (data) => {
    delivering = true;
    try {
      listener({ data });
    } finally {
      delivering = false;
    }
  };
  await import("./snapshot-worker");
});

afterEach(() => {
  runSnapshotJob.mockReset();
  runRestoreJob.mockReset();
  vi.restoreAllMocks();
  Reflect.deleteProperty(process, "parentPort");
});

function finishWith(result: SnapshotJobResult | Error): void {
  runSnapshotJob.mockImplementation(async () => {
    if (result instanceof Error) {
      throw result;
    }
    return result;
  });
}

describe("the snapshot worker", () => {
  it("exits with a failure without running a job it could not read", async () => {
    expect(() => deliver({ kind: "take" })).toThrow(ProcessExited);

    expect(await exited).toBe(1);
    expect(runSnapshotJob).not.toHaveBeenCalled();
  });

  it("runs the job it was given against the cloud it names", async () => {
    finishWith({
      kind: "completed",
      uploads: {
        kind: "every_pending_tried",
        tally: { uploaded: 0, refused: 0, failed: 0 },
        latestAnnouncedKeyVersion: undefined,
      },
      latestAnnouncedKeyVersion: undefined,
    });

    deliver(UPLOAD_JOB);
    await exited;

    expect(runSnapshotJob).toHaveBeenCalledWith(
      UPLOAD_JOB,
      expect.objectContaining({
        cloud: expect.objectContaining({ cloudUrl: "https://cloud.example.test" }),
      }),
    );
  });

  it("exits with success once the job completed", async () => {
    finishWith({
      kind: "completed",
      uploads: {
        kind: "cloud_unreachable",
        tally: { uploaded: 0, refused: 0, failed: 1 },
        latestAnnouncedKeyVersion: undefined,
      },
      latestAnnouncedKeyVersion: undefined,
    });

    deliver(UPLOAD_JOB);

    expect(await exited).toBe(0);
  });

  it("reports a copy that failed its checks to main and stays alive for main to end it", async () => {
    finishWith({ kind: "aborted", stage: "integrity_check" });

    deliver(UPLOAD_JOB);

    expect(await posted).toEqual({ type: "snapshot-copy-failed", stage: "integrity_check" });
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("exits with a failure when the job failed", async () => {
    finishWith(new Error("disk full"));

    deliver(UPLOAD_JOB);

    expect(await exited).toBe(1);
  });

  it("runs a restore job against the cloud it names, without taking or uploading anything", async () => {
    runRestoreJob.mockResolvedValue({ kind: "no_generation" });

    deliver(RESTORE_JOB);
    await posted;

    expect(runRestoreJob).toHaveBeenCalledWith(
      RESTORE_JOB,
      expect.objectContaining({
        cloud: expect.objectContaining({ cloudUrl: "https://cloud.example.test" }),
      }),
    );
    expect(runSnapshotJob).not.toHaveBeenCalled();
  });

  it("reports how the restore ended to main and stays alive for main to end it", async () => {
    runRestoreJob.mockResolvedValue({ kind: "restored", generationId: "g", failures: [] });

    deliver(RESTORE_JOB);

    expect(await posted).toEqual({ type: "snapshot-restore-finished", outcome: "restored" });
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("logs why each generation could not be used when none was usable", async () => {
    runRestoreJob.mockResolvedValue({
      kind: "none_usable",
      failures: [{ generationId: "g1", stage: "hash_mismatch" }],
    });

    deliver(RESTORE_JOB);
    await posted;

    expect(console.error).toHaveBeenCalledWith("snapshot worker: no generation could be restored", [
      { generationId: "g1", stage: "hash_mismatch" },
    ]);
  });

  it("exits with a failure when the restore job failed", async () => {
    runRestoreJob.mockRejectedValue(new Error("disk full"));

    deliver(RESTORE_JOB);

    expect(await exited).toBe(1);
  });
});
