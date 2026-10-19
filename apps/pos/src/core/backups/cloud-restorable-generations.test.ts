import { describe, expect, it } from "vitest";
import { createCloudRestorableGenerations } from "./cloud-restorable-generations";
import {
  CLOUD_URL,
  DEVICE_TOKEN,
  downloadUrlOf,
  type EncryptedSnapshot,
  FakeRestorableCloud,
  REGISTER_ID,
} from "./test-support/restorable-snapshot-cloud";

function snapshot(generationId: string, createdAt: string): EncryptedSnapshot {
  return {
    generationId,
    keyVersion: 2,
    createdAt,
    object: Buffer.from("object"),
    size: 6,
    sha256: "ab".repeat(32),
  };
}

function restorableFrom(cloud: FakeRestorableCloud) {
  return createCloudRestorableGenerations({
    cloud: { cloudUrl: CLOUD_URL, fetch: cloud.fetch, sleep: async () => {} },
    deviceToken: DEVICE_TOKEN,
  });
}

describe("the generations the cloud lists for a restore", () => {
  it("asks with the installation's token and names each generation for the restore", async () => {
    const cloud = new FakeRestorableCloud();
    cloud.snapshots = [snapshot("0f8fad5b-d9cb-469f-a165-70867728950e", "2026-10-15T12:00:00.000Z")];

    const answer = await restorableFrom(cloud).generations.list();

    expect(cloud.requests).toEqual([
      { url: `${CLOUD_URL}/api/devices/current/snapshots`, authorization: `Bearer ${DEVICE_TOKEN}` },
    ]);
    expect(answer).toEqual({
      kind: "listed",
      generations: [
        {
          generationId: "0f8fad5b-d9cb-469f-a165-70867728950e",
          registerId: REGISTER_ID,
          createdAt: new Date("2026-10-15T12:00:00.000Z"),
          size: 6,
          sha256: "ab".repeat(32),
          keyVersion: 2,
        },
      ],
    });
  });

  it("lists nothing when the cloud holds no generation", async () => {
    const answer = await restorableFrom(new FakeRestorableCloud()).generations.list();

    expect(answer).toEqual({ kind: "listed", generations: [] });
  });

  it("remembers where each listed generation is downloaded from", async () => {
    const cloud = new FakeRestorableCloud();
    cloud.snapshots = [snapshot("0f8fad5b-d9cb-469f-a165-70867728950e", "2026-10-15T12:00:00.000Z")];
    const restorable = restorableFrom(cloud);
    await restorable.generations.list();

    expect(restorable.downloadUrlOf("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(
      downloadUrlOf("0f8fad5b-d9cb-469f-a165-70867728950e"),
    );
    expect(restorable.downloadUrlOf("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });

  it.each(["unreachable", "refused"] as const)("is unreachable when the cloud is %s", async (listing) => {
    const cloud = new FakeRestorableCloud();
    cloud.listing = listing;

    expect(await restorableFrom(cloud).generations.list()).toEqual({ kind: "unreachable" });
  });

  it("is unreachable when the cloud answers something it cannot read", async () => {
    const unreadable = createCloudRestorableGenerations({
      cloud: {
        cloudUrl: CLOUD_URL,
        fetch: async () => Response.json({ generations: "none" }),
        sleep: async () => {},
      },
      deviceToken: DEVICE_TOKEN,
    });

    expect(await unreadable.generations.list()).toEqual({ kind: "unreachable" });
  });
});
