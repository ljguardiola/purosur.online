import type { DeviceCredentials, SnapshotWorkerLaunchRequest } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { createRestoreLaunch } from "./restore-launch";
import type { RestorePending } from "./restore-pending";

const KEY = Buffer.alloc(32, 3).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 4).toString("base64");
const CREDENTIALS: DeviceCredentials = {
  device_id: "device-new",
  device_token: "prefix.secret",
  pepper: "cGVwcGVy",
  token_received_at: "2026-10-19T12:00:00.000Z",
  keys: {
    snapshot_key_versions: [
      { version: 1, key: KEY },
      { version: 2, key: OTHER_KEY },
    ],
    contingency_ticket_key: { version: 1, key: KEY },
    outbox_chain_key: KEY,
  },
};

function setup(
  overrides: {
    credentials?: DeviceCredentials | undefined;
    cloudUrl?: string | undefined;
    dataFolder?: string | undefined;
    markedDevice?: string | undefined;
  } = {},
) {
  const events: string[] = [];
  let markedDevice = "markedDevice" in overrides ? overrides.markedDevice : "device-new";
  const pending: RestorePending = {
    isPending: () => true,
    deviceId: () => markedDevice,
    setsAsideLiveDatabase: () => false,
    settleSetAside: () => undefined,
    begin: (deviceId) => {
      events.push(`begin ${deviceId}`);
      markedDevice = deviceId;
    },
    clear: () => events.push("clear"),
  };
  const posted: SnapshotWorkerLaunchRequest[] = [];
  const launch = createRestoreLaunch({
    pending,
    readCredentials: async () => ("credentials" in overrides ? overrides.credentials : CREDENTIALS),
    cloudUrl: "cloudUrl" in overrides ? overrides.cloudUrl : "https://cloud.example.test",
    dataFolder: "dataFolder" in overrides ? overrides.dataFolder : "/data",
    postToMain: (message) => {
      events.push("launch");
      posted.push(message);
    },
  });
  return { launch, posted, events };
}

describe("launching the restore", () => {
  it("asks main for a worker that restores with every snapshot key the installation holds", async () => {
    const { launch, posted, events } = setup();

    expect(await launch()).toBe(true);

    expect(posted).toEqual([
      {
        type: "launch-snapshot-worker",
        time_limit_ms: 60_000,
        job: {
          kind: "restore",
          device_token: "prefix.secret",
          cloud_url: "https://cloud.example.test",
          staged_database_path: "/data/register.restored.sqlite",
          snapshot_keys: CREDENTIALS.keys?.snapshot_key_versions,
        },
      },
    ]);
    expect(events).toEqual(["launch"]);
  });

  it("names the installation it holds the credentials of in a restore marker that could not be read, before restoring", async () => {
    const { launch, events } = setup({ markedDevice: undefined });

    expect(await launch()).toBe(true);

    expect(events).toEqual(["begin device-new", "launch"]);
  });

  it.each([
    ["no credentials", { credentials: undefined }],
    ["credentials with no keys", { credentials: { ...CREDENTIALS, keys: undefined } }],
    ["no cloud", { cloudUrl: undefined }],
    ["no data folder", { dataFolder: undefined }],
  ])("asks main for nothing with %s", async (_name, overrides) => {
    const { launch, posted } = setup(overrides);

    expect(await launch()).toBe(false);
    expect(posted).toEqual([]);
  });
});
