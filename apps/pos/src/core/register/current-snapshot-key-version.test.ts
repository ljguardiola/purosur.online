import { describe, expect, it } from "vitest";
import { cloudCurrentSnapshotKeyVersion } from "./current-snapshot-key-version";
import { cloudRefusal, FakeSnapshotCloud } from "./test-support/fake-snapshot-cloud";

function ask(cloud: FakeSnapshotCloud) {
  return cloudCurrentSnapshotKeyVersion(
    { cloudUrl: "https://cloud.example.test", fetch: cloud.fetch, sleep: async () => {} },
    "prefix.secret",
  );
}

describe("cloudCurrentSnapshotKeyVersion", () => {
  it("answers the version the cloud names as current, asked with the device token", async () => {
    const cloud = new FakeSnapshotCloud();
    cloud.onKeyVersion = () => Response.json({ current_key_version: 4 });

    expect(await ask(cloud)).toBe(4);
    expect(cloud.keyVersionAsks).toEqual([
      { authorization: "Bearer prefix.secret", callsBefore: 0 },
    ]);
  });

  it.each([
    ["is unreachable", () => "unreachable" as const],
    ["fails on it", () => new Response(null, { status: 500 })],
    ["refuses it", () => cloudRefusal("device_token_rejected", 401)],
    ["answers something it cannot read", () => Response.json({ current_key_version: "4" })],
  ])("answers nothing when the cloud %s", async (_name, answer) => {
    const cloud = new FakeSnapshotCloud();
    cloud.onKeyVersion = answer;

    expect(await ask(cloud)).toBeUndefined();
  });
});
