import { snapshotWorkerLaunchSchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  createSnapshotWorkerLaunch,
  type SnapshotWorkerLaunchDeps,
} from "./snapshot-worker-launch";

const KEY_1 = Buffer.alloc(32, 1).toString("base64");
const KEY_2 = Buffer.alloc(32, 2).toString("base64");

const CREDENTIALS = {
  device_id: "a4b1",
  device_token: "prefix.secret",
  pepper: "cGVwcGVy",
  keys: {
    snapshot_key_versions: [
      { version: 2, key: KEY_2 },
      { version: 1, key: KEY_1 },
    ],
    contingency_ticket_key: { version: 1, key: KEY_1 },
    outbox_chain_key: KEY_1,
  },
};

const TAKE = {
  kind: "take",
  generationId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  sequences: { lastDeviceSeq: 41, pullCursor: 977 },
} as const;

function setup(overrides: Partial<SnapshotWorkerLaunchDeps> = {}) {
  const posted: unknown[] = [];
  const launcher = createSnapshotWorkerLaunch({
    readCredentials: async () => CREDENTIALS,
    readRegisterId: () => "7d2f6c5e-1b0a-4f43-9a52-3c7d8e9f0a11",
    cloudUrl: "https://cloud.example.test",
    databasePath: "/data/register.sqlite",
    snapshotsFolder: "/data/snapshots",
    postToMain: (message) => posted.push(message),
    ...overrides,
  });
  return { launcher, posted };
}

describe("createSnapshotWorkerLaunch", () => {
  it("asks main to launch a worker that takes a snapshot with the newest key", async () => {
    const { launcher, posted } = setup();

    expect(await launcher.launch(TAKE)).toBe(true);

    expect(posted).toEqual([
      {
        type: "launch-snapshot-worker",
        time_limit_ms: 60_000,
        job: {
          kind: "take",
          register_id: "7d2f6c5e-1b0a-4f43-9a52-3c7d8e9f0a11",
          generation_id: TAKE.generationId,
          key: { version: 2, key: KEY_2 },
          device_token: "prefix.secret",
          cloud_url: "https://cloud.example.test",
          database_path: "/data/register.sqlite",
          snapshots_folder: "/data/snapshots",
          last_device_seq: 41,
          pull_cursor: 977,
        },
      },
    ]);
  });

  it("asks for a request the worker's schema accepts", async () => {
    const { launcher, posted } = setup();

    await launcher.launch(TAKE);
    await launcher.launch({ kind: "upload_pending" });

    expect(posted.map((message) => snapshotWorkerLaunchSchema.safeParse(message).success)).toEqual([
      true,
      true,
    ]);
  });

  it("asks main to launch a worker that only uploads, with no key and no database", async () => {
    const { launcher, posted } = setup();

    expect(await launcher.launch({ kind: "upload_pending" })).toBe(true);

    expect(posted).toEqual([
      {
        type: "launch-snapshot-worker",
        time_limit_ms: 60_000,
        job: {
          kind: "upload_pending",
          device_token: "prefix.secret",
          cloud_url: "https://cloud.example.test",
          snapshots_folder: "/data/snapshots",
        },
      },
    ]);
  });

  it("uploads even when the register holds no key", async () => {
    const { credentials } = { credentials: { ...CREDENTIALS, keys: undefined } };
    const { launcher, posted } = setup({ readCredentials: async () => credentials });

    expect(await launcher.launch({ kind: "upload_pending" })).toBe(true);
    expect(posted).toHaveLength(1);
  });

  it.each([
    ["the register is not enrolled", { readCredentials: async () => undefined }],
    ["the cloud is not configured", { cloudUrl: undefined }],
  ])("launches nothing when %s", async (_reason, override) => {
    const { launcher, posted } = setup(override);

    expect(await launcher.launch(TAKE)).toBe(false);
    expect(await launcher.launch({ kind: "upload_pending" })).toBe(false);
    expect(posted).toEqual([]);
  });

  it.each([
    ["holds no key", { readCredentials: async () => ({ ...CREDENTIALS, keys: undefined }) }],
    ["knows no register id", { readRegisterId: () => undefined }],
  ])("takes no snapshot when the register %s", async (_reason, override) => {
    const { launcher, posted } = setup(override);

    expect(await launcher.launch(TAKE)).toBe(false);
    expect(posted).toEqual([]);
  });
});
