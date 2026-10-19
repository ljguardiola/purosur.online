import type { DeviceCredentials, SnapshotWorkerLaunchRequest } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { createRestoreLaunch } from "./restore-launch";

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
  overrides: { credentials?: DeviceCredentials | undefined; cloudUrl?: string | undefined } = {},
) {
  const posted: SnapshotWorkerLaunchRequest[] = [];
  const launch = createRestoreLaunch({
    readCredentials: async () => ("credentials" in overrides ? overrides.credentials : CREDENTIALS),
    cloudUrl: "cloudUrl" in overrides ? overrides.cloudUrl : "https://cloud.example.test",
    stagedDatabasePath: "/data/register.restored.sqlite",
    postToMain: (message) => posted.push(message),
  });
  return { launch, posted };
}

describe("launching the restore", () => {
  it("asks main for a worker that restores with every snapshot key the installation holds", async () => {
    const { launch, posted } = setup();

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
  });

  it.each([
    ["no credentials", { credentials: undefined }],
    ["credentials with no keys", { credentials: { ...CREDENTIALS, keys: undefined } }],
    ["no cloud", { cloudUrl: undefined }],
  ])("asks main for nothing with %s", async (_name, overrides) => {
    const { launch, posted } = setup(overrides);

    expect(await launch()).toBe(false);
    expect(posted).toEqual([]);
  });
});
