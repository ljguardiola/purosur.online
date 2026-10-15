import type { SnapshotWorkerJobMessage } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  runSnapshotJob as RunSnapshotJob,
  SnapshotJobResult,
} from "./register/run-snapshot-job";

const runSnapshotJob = vi.hoisted(() => vi.fn<typeof RunSnapshotJob>());

vi.mock("electron", () => ({ net: { fetch: vi.fn() } }));
vi.mock("./register/run-snapshot-job", () => ({ runSnapshotJob }));

const UPLOAD_JOB: SnapshotWorkerJobMessage = {
  kind: "upload_pending",
  device_token: "prefix.secret",
  cloud_url: "https://cloud.example.test",
  snapshots_folder: "/data/snapshots",
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
      uploads: { kind: "every_pending_tried", tally: { uploaded: 0, refused: 0, failed: 0 } },
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
      uploads: { kind: "cloud_unreachable", tally: { uploaded: 0, refused: 0, failed: 1 } },
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
});
