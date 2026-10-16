import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SnapshotManifest } from "@purosur/contracts";
import type { LocalSnapshotGeneration } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CloudClientDeps } from "../platform/cloud-client";
import { objectPath, readManifests, writeManifest } from "./snapshot-generations-folder";
import { cloudSnapshotUploads, uploadPendingGenerations } from "./snapshot-upload";
import { cloudRefusal, FakeSnapshotCloud } from "./test-support/fake-snapshot-cloud";

const NOW = new Date("2026-10-15T13:00:00.000Z");
const TOKEN = "prefix.secret";
const GENERATION_ID = "00000000-0000-4000-8000-000000000002";
const DESTINATION = {
  url: `https://storage.example.test/objects/${GENERATION_ID}`,
  headers: { "x-amz-meta-key-version": "2" },
};

const GENERATION: LocalSnapshotGeneration = {
  generationId: GENERATION_ID,
  createdAt: new Date("2026-10-15T12:00:00.000Z"),
  sequences: { lastDeviceSeq: 1, pullCursor: 1 },
  keyVersion: 3,
  size: 1234,
  sha256: "cd".repeat(32),
  uploadedAt: null,
  refusedAt: null,
};

let cloud: FakeSnapshotCloud;

beforeEach(() => {
  cloud = new FakeSnapshotCloud();
});

function cloudDeps(): CloudClientDeps {
  return { cloudUrl: "https://cloud.example.test", fetch: cloud.fetch, sleep: async () => {} };
}

function uploads() {
  return cloudSnapshotUploads(cloudDeps(), TOKEN);
}

describe("cloudSnapshotUploads", () => {
  describe("declare", () => {
    it("declares the size, hash and key version of the generation with the device token", async () => {
      const answer = await uploads().declare(GENERATION);

      expect(cloud.calls).toEqual([
        {
          kind: "declare",
          authorization: `Bearer ${TOKEN}`,
          body: {
            generation_id: GENERATION_ID,
            size: 1234,
            sha256: "cd".repeat(32),
            key_version: 3,
          },
        },
      ]);
      expect(answer).toEqual({
        kind: "accepted",
        authorization: DESTINATION,
        currentKeyVersion: 2,
      });
    });

    it("carries the key version the cloud announced as the register's current one", async () => {
      cloud.onDeclare = () =>
        Response.json({
          upload_url: DESTINATION.url,
          required_headers: DESTINATION.headers,
          expires_at: "2026-10-15T12:15:00.000Z",
          current_key_version: 5,
        });

      expect(await uploads().declare(GENERATION)).toMatchObject({ currentKeyVersion: 5 });
    });

    it("fails the declaration when the answer announces no key version", async () => {
      cloud.onDeclare = () =>
        Response.json({
          upload_url: DESTINATION.url,
          required_headers: DESTINATION.headers,
          expires_at: "2026-10-15T12:15:00.000Z",
        });

      expect(await uploads().declare(GENERATION)).toEqual({ kind: "failed" });
    });

    it("answers the code the cloud refused the declaration with", async () => {
      cloud.onDeclare = () => cloudRefusal("conflict", 409);

      expect(await uploads().declare(GENERATION)).toEqual({ kind: "refused", code: "conflict" });
    });

    it("answers unreachable when the cloud cannot be reached", async () => {
      cloud.onDeclare = () => "unreachable";

      expect(await uploads().declare(GENERATION)).toEqual({ kind: "unreachable" });
    });

    it("answers failed when the cloud answers in a shape it does not know", async () => {
      cloud.onDeclare = () => Response.json({ upload_url: "not a url" });

      expect(await uploads().declare(GENERATION)).toEqual({ kind: "failed" });
    });
  });

  describe("putObject", () => {
    it("sends the object to the address the cloud gave, with the headers it required", async () => {
      const step = await uploads().putObject(
        DESTINATION,
        new Uint8Array(Buffer.from("encrypted bytes")),
      );

      expect(step).toBe("done");
      const [put] = cloud.calls;
      expect(put).toMatchObject({ kind: "put", url: DESTINATION.url });
      expect(put?.kind === "put" && put.body.toString()).toBe("encrypted bytes");
      expect(put?.kind === "put" && put.headers["x-amz-meta-key-version"]).toBe("2");
    });

    it("answers failed when the storage refuses the object", async () => {
      cloud.onPut = () => new Response("denied", { status: 403 });

      expect(await uploads().putObject(DESTINATION, new Uint8Array(1))).toBe("failed");
    });

    it("answers unreachable when the storage cannot be reached", async () => {
      cloud.onPut = () => "unreachable";

      expect(await uploads().putObject(DESTINATION, new Uint8Array(1))).toBe("unreachable");
    });
  });

  describe("confirmUploaded", () => {
    it("tells the cloud the generation was uploaded", async () => {
      const step = await uploads().confirmUploaded(GENERATION);

      expect(step).toBe("done");
      expect(cloud.calls).toEqual([{ kind: "uploaded", generationId: GENERATION_ID }]);
    });

    it("answers failed when the cloud refuses the confirmation", async () => {
      cloud.onUploaded = () => cloudRefusal("not_found", 404);

      expect(await uploads().confirmUploaded(GENERATION)).toBe("failed");
    });

    it("answers unreachable when the cloud cannot be reached", async () => {
      cloud.onUploaded = () => "unreachable";

      expect(await uploads().confirmUploaded(GENERATION)).toBe("unreachable");
    });
  });
});

describe("uploadPendingGenerations", () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "snapshot-upload-"));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("uploads the generations of the folder to the cloud and records them uploaded", async () => {
    const manifest: SnapshotManifest = {
      generation_id: GENERATION_ID,
      created_at: "2026-10-15T12:00:00.000Z",
      last_device_seq: 1,
      pull_cursor: 1,
      key_version: 2,
      size: 5,
      sha256: "ab".repeat(32),
      uploaded_at: null,
      refused_at: null,
    };
    await writeManifest(folder, manifest);
    await writeFile(objectPath(folder, GENERATION_ID), "bytes");

    const outcome = await uploadPendingGenerations({
      folder,
      deviceToken: TOKEN,
      cloud: cloudDeps(),
      now: () => NOW,
    });

    expect(outcome).toEqual({
      kind: "every_pending_tried",
      tally: { uploaded: 1, refused: 0, failed: 0 },
      latestAnnouncedKeyVersion: 2,
    });
    expect(cloud.calls.map((call) => call.kind)).toEqual(["declare", "put", "uploaded"]);
    expect(await readManifests(folder)).toEqual([{ ...manifest, uploaded_at: NOW.toISOString() }]);
  });
});
