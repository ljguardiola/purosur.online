import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SnapshotManifest } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { objectPath, readManifests, writeManifest } from "./snapshot-generations-folder";
import { uploadPendingGenerations } from "./snapshot-upload";
import { cloudRefusal, FakeSnapshotCloud } from "./test-support/fake-snapshot-cloud";

const NOW = new Date("2026-10-15T13:00:00.000Z");
const TOKEN = "prefix.secret";
const OLDER_ID = "00000000-0000-4000-8000-000000000001";
const NEWER_ID = "00000000-0000-4000-8000-000000000002";

let folder: string;
let cloud: FakeSnapshotCloud;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "snapshot-upload-"));
  cloud = new FakeSnapshotCloud();
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function manifest(id: string, createdAt: string, overrides: Partial<SnapshotManifest> = {}) {
  return {
    generation_id: id,
    created_at: createdAt,
    last_device_seq: 1,
    pull_cursor: 1,
    key_version: 2,
    size: 5,
    sha256: "ab".repeat(32),
    uploaded_at: null,
    refused_at: null,
    ...overrides,
  } satisfies SnapshotManifest;
}

async function generation(
  id: string,
  createdAt: string,
  overrides: Partial<SnapshotManifest> = {},
  content = `object ${id}`,
): Promise<void> {
  await writeManifest(folder, manifest(id, createdAt, overrides));
  await writeFile(objectPath(folder, id), content);
}

function upload() {
  return uploadPendingGenerations({
    folder,
    deviceToken: TOKEN,
    cloud: {
      cloudUrl: "https://cloud.example.test",
      fetch: cloud.fetch,
      sleep: async () => {},
    },
    now: () => NOW,
  });
}

async function manifestOf(id: string): Promise<SnapshotManifest | undefined> {
  return (await readManifests(folder)).find((entry) => entry.generation_id === id);
}

describe("uploadPendingGenerations", () => {
  it("declares the generation, uploads its object, confirms it, and then marks it uploaded", async () => {
    await generation(NEWER_ID, "2026-10-15T12:00:00.000Z");

    const summary = await upload();

    expect(cloud.calls.map((call) => call.kind)).toEqual(["declare", "put", "uploaded"]);
    expect(summary).toEqual({ uploaded: 1, refused: 0, failed: 0 });
    expect(await manifestOf(NEWER_ID)).toMatchObject({ uploaded_at: NOW.toISOString() });
  });

  it("declares the size, hash and key version of the generation with the device token", async () => {
    await generation(NEWER_ID, "2026-10-15T12:00:00.000Z", {
      size: 1234,
      sha256: "cd".repeat(32),
      key_version: 3,
    });

    await upload();

    expect(cloud.calls[0]).toEqual({
      kind: "declare",
      authorization: `Bearer ${TOKEN}`,
      body: { generation_id: NEWER_ID, size: 1234, sha256: "cd".repeat(32), key_version: 3 },
    });
  });

  it("sends the encrypted object to the address the cloud gave, with the headers it required", async () => {
    await generation(NEWER_ID, "2026-10-15T12:00:00.000Z", {}, "encrypted bytes");

    await upload();

    const put = cloud.calls[1];
    expect(put).toMatchObject({
      kind: "put",
      url: `https://storage.example.test/objects/${NEWER_ID}`,
    });
    expect(put?.kind === "put" && put.body.toString()).toBe("encrypted bytes");
    expect(put?.kind === "put" && put.headers["x-amz-meta-key-version"]).toBe("2");
  });

  it("keeps the generation pending until the cloud has confirmed it", async () => {
    await generation(NEWER_ID, "2026-10-15T12:00:00.000Z");
    const uploadedAtOnCall: Record<string, string | null | undefined> = {};
    cloud.observe = async (call) => {
      uploadedAtOnCall[call.kind] = (await manifestOf(NEWER_ID))?.uploaded_at;
    };

    await upload();

    expect(uploadedAtOnCall).toEqual({ declare: null, put: null, uploaded: null });
  });

  it("uploads the newest generation first", async () => {
    await generation(OLDER_ID, "2026-10-15T11:00:00.000Z");
    await generation(NEWER_ID, "2026-10-15T12:00:00.000Z");

    const summary = await upload();

    expect(
      cloud.calls.filter((call) => call.kind === "declare").map((call) => call.body),
    ).toMatchObject([{ generation_id: NEWER_ID }, { generation_id: OLDER_ID }]);
    expect(summary.uploaded).toBe(2);
  });

  it("leaves alone a generation already uploaded or refused", async () => {
    await generation(OLDER_ID, "2026-10-15T11:00:00.000Z", {
      uploaded_at: "2026-10-15T11:05:00.000Z",
    });
    await generation(NEWER_ID, "2026-10-15T12:00:00.000Z", {
      refused_at: "2026-10-15T12:05:00.000Z",
    });

    const summary = await upload();

    expect(cloud.calls).toEqual([]);
    expect(summary).toEqual({ uploaded: 0, refused: 0, failed: 0 });
  });

  it.each(["conflict", "validation_failed"] as const)(
    "records a declaration refused as %s, so it is not tried again, and goes on to the next one",
    async (code) => {
      await generation(OLDER_ID, "2026-10-15T11:00:00.000Z");
      await generation(NEWER_ID, "2026-10-15T12:00:00.000Z");
      cloud.onDeclare = (body) =>
        body.generation_id === NEWER_ID
          ? cloudRefusal(code, code === "conflict" ? 409 : 400)
          : new Response(
              JSON.stringify({
                upload_url: "https://storage.example.test/objects/older",
                required_headers: {},
                expires_at: "2026-10-15T12:15:00.000Z",
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );

      const summary = await upload();

      expect(summary).toEqual({ uploaded: 1, refused: 1, failed: 0 });
      expect(await manifestOf(NEWER_ID)).toMatchObject({
        refused_at: NOW.toISOString(),
        uploaded_at: null,
      });
      expect(cloud.calls.some((call) => call.kind === "put" && call.url.endsWith("older"))).toBe(
        true,
      );
    },
  );

  it("stops at the first generation when the cloud cannot be reached, leaving all pending", async () => {
    await generation(OLDER_ID, "2026-10-15T11:00:00.000Z");
    await generation(NEWER_ID, "2026-10-15T12:00:00.000Z");
    cloud.onDeclare = () => "unreachable";

    const summary = await upload();

    expect(cloud.calls).toHaveLength(1);
    expect(summary).toEqual({ uploaded: 0, refused: 0, failed: 1 });
    expect((await readManifests(folder)).every((entry) => entry.uploaded_at === null)).toBe(true);
  });

  it("leaves a generation pending when the cloud is unavailable, and goes on to the next", async () => {
    await generation(OLDER_ID, "2026-10-15T11:00:00.000Z");
    await generation(NEWER_ID, "2026-10-15T12:00:00.000Z");
    const original = cloud.onDeclare;
    cloud.onDeclare = (body) =>
      body.generation_id === NEWER_ID
        ? cloudRefusal("snapshot_backups_unavailable", 503)
        : original(body);

    const summary = await upload();

    expect(summary).toEqual({ uploaded: 1, refused: 0, failed: 1 });
    expect(await manifestOf(NEWER_ID)).toMatchObject({ uploaded_at: null, refused_at: null });
    expect(await manifestOf(OLDER_ID)).toMatchObject({ uploaded_at: NOW.toISOString() });
  });

  it("leaves a generation pending when the storage refuses the object, without confirming it", async () => {
    await generation(NEWER_ID, "2026-10-15T12:00:00.000Z");
    cloud.onPut = () => new Response("denied", { status: 403 });

    const summary = await upload();

    expect(cloud.calls.map((call) => call.kind)).toEqual(["declare", "put"]);
    expect(summary).toEqual({ uploaded: 0, refused: 0, failed: 1 });
    expect(await manifestOf(NEWER_ID)).toMatchObject({ uploaded_at: null, refused_at: null });
  });

  it("stops when the storage cannot be reached", async () => {
    await generation(OLDER_ID, "2026-10-15T11:00:00.000Z");
    await generation(NEWER_ID, "2026-10-15T12:00:00.000Z");
    cloud.onPut = () => "unreachable";

    await upload();

    expect(cloud.calls.map((call) => call.kind)).toEqual(["declare", "put"]);
  });

  it("leaves a generation pending when its confirmation does not arrive", async () => {
    await generation(NEWER_ID, "2026-10-15T12:00:00.000Z");
    cloud.onUploaded = () => "unreachable";

    const summary = await upload();

    expect(summary).toEqual({ uploaded: 0, refused: 0, failed: 1 });
    expect(await manifestOf(NEWER_ID)).toMatchObject({ uploaded_at: null });
  });

  it("records a generation whose object is gone as refused, as it can never be uploaded", async () => {
    await writeManifest(folder, manifest(NEWER_ID, "2026-10-15T12:00:00.000Z"));

    const summary = await upload();

    expect(cloud.calls).toEqual([]);
    expect(summary).toEqual({ uploaded: 0, refused: 1, failed: 0 });
    expect(await manifestOf(NEWER_ID)).toMatchObject({ refused_at: NOW.toISOString() });
  });

  it("leaves a generation pending when the cloud answers the declaration in a shape it does not know", async () => {
    await generation(NEWER_ID, "2026-10-15T12:00:00.000Z");
    cloud.onDeclare = () => Response.json({ upload_url: "not a url" });

    const summary = await upload();

    expect(cloud.calls.map((call) => call.kind)).toEqual(["declare"]);
    expect(summary).toEqual({ uploaded: 0, refused: 0, failed: 1 });
  });
});
