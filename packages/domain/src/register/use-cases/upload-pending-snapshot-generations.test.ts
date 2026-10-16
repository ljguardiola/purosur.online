import { describe, expect, it } from "vitest";
import type { LocalSnapshotGeneration } from "../model/local-snapshot-generation.js";
import {
  FakeLocalSnapshotGenerations,
  FakeSnapshotUploadCloud,
  type SnapshotUploadEvent,
} from "./test-support/fake-snapshot-upload.js";
import { uploadPendingSnapshotGenerations } from "./upload-pending-snapshot-generations.js";

const NOW = new Date("2026-10-15T13:00:00.000Z");
const OLDER_ID = "00000000-0000-4000-8000-000000000001";
const NEWER_ID = "00000000-0000-4000-8000-000000000002";

function generation(
  generationId: string,
  createdAt: string,
  overrides: Partial<LocalSnapshotGeneration> = {},
): LocalSnapshotGeneration {
  return {
    generationId,
    createdAt: new Date(createdAt),
    sequences: { lastDeviceSeq: 1, pullCursor: 1 },
    keyVersion: 2,
    size: 5,
    sha256: "ab".repeat(32),
    uploadedAt: null,
    refusedAt: null,
    ...overrides,
  };
}

const OLDER = generation(OLDER_ID, "2026-10-15T11:00:00.000Z");
const NEWER = generation(NEWER_ID, "2026-10-15T12:00:00.000Z");

function setup() {
  const events: SnapshotUploadEvent[] = [];
  const generations = new FakeLocalSnapshotGenerations(events);
  const cloud = new FakeSnapshotUploadCloud(events);
  const upload = () =>
    uploadPendingSnapshotGenerations({ generations, cloud, clock: { now: () => NOW } });
  return { events, generations, cloud, upload };
}

describe("uploadPendingSnapshotGenerations", () => {
  it("declares the generation, sends its object where the cloud said, confirms it, and only then marks it uploaded", async () => {
    const { events, generations, upload } = setup();
    generations.hold(NEWER, "encrypted bytes");

    const outcome = await upload();

    expect(outcome).toEqual({
      kind: "every_pending_tried",
      tally: { uploaded: 1, refused: 0, failed: 0 },
      latestAnnouncedKeyVersion: 2,
    });
    expect(events).toEqual([
      { kind: "declare", generationId: NEWER_ID },
      { kind: "put", authorization: `upload of ${NEWER_ID}`, object: "encrypted bytes" },
      { kind: "confirm", generationId: NEWER_ID },
      { kind: "mark_uploaded", generationId: NEWER_ID, at: NOW },
    ]);
  });

  it("uploads the newest generation first", async () => {
    const { events, generations, upload } = setup();
    generations.hold(OLDER);
    generations.hold(NEWER);

    const outcome = await upload();

    expect(events.filter((event) => event.kind === "declare")).toEqual([
      { kind: "declare", generationId: NEWER_ID },
      { kind: "declare", generationId: OLDER_ID },
    ]);
    expect(outcome).toMatchObject({ tally: { uploaded: 2 } });
  });

  describe("announced key version", () => {
    function announcing(versions: Record<string, number>) {
      const harness = setup();
      harness.generations.hold(OLDER);
      harness.generations.hold(NEWER);
      const accept = harness.cloud.onDeclare;
      harness.cloud.onDeclare = (declared) => {
        const answer = accept(declared);
        const announced = versions[declared.generationId];
        return answer.kind === "accepted" && announced !== undefined
          ? { ...answer, currentKeyVersion: announced }
          : answer;
      };
      return harness;
    }

    it.each([
      ["the newest generation's", { [NEWER_ID]: 5, [OLDER_ID]: 3 }],
      ["the oldest generation's", { [NEWER_ID]: 3, [OLDER_ID]: 5 }],
    ])(
      "answers the highest version the cloud announced, when it is %s answer",
      async (_name, versions) => {
        const { upload } = announcing(versions);

        expect(await upload()).toMatchObject({ latestAnnouncedKeyVersion: 5 });
      },
    );

    it("answers the version announced before the cloud became unreachable", async () => {
      const { cloud, upload } = announcing({ [NEWER_ID]: 4 });
      const announce = cloud.onDeclare;
      cloud.onDeclare = (declared) =>
        declared.generationId === OLDER_ID ? { kind: "unreachable" } : announce(declared);

      expect(await upload()).toMatchObject({
        kind: "cloud_unreachable",
        latestAnnouncedKeyVersion: 4,
      });
    });

    it("answers none when the cloud accepted no declaration", async () => {
      const { generations, cloud, upload } = setup();
      generations.hold(NEWER);
      cloud.onDeclare = () => ({ kind: "failed" });

      expect((await upload()).latestAnnouncedKeyVersion).toBeUndefined();
    });
  });

  it("leaves alone a generation already uploaded or refused", async () => {
    const { events, generations, upload } = setup();
    generations.hold({ ...OLDER, uploadedAt: NOW });
    generations.hold({ ...NEWER, refusedAt: NOW });

    const outcome = await upload();

    expect(events).toEqual([]);
    expect(outcome).toEqual({
      kind: "every_pending_tried",
      tally: { uploaded: 0, refused: 0, failed: 0 },
    });
  });

  it.each(["conflict", "validation_failed"])(
    "records a generation the cloud refused as %s, so it is not tried again, and goes on to the next one",
    async (code) => {
      const { generations, cloud, upload } = setup();
      generations.hold(OLDER);
      generations.hold(NEWER);
      const accept = cloud.onDeclare;
      cloud.onDeclare = (declared) =>
        declared.generationId === NEWER_ID ? { kind: "refused", code } : accept(declared);

      const outcome = await upload();

      expect(outcome).toEqual({
        kind: "every_pending_tried",
        tally: { uploaded: 1, refused: 1, failed: 0 },
        latestAnnouncedKeyVersion: 2,
      });
      expect(generations.find(NEWER_ID)).toMatchObject({ refusedAt: NOW, uploadedAt: null });
      expect(generations.find(OLDER_ID)).toMatchObject({ uploadedAt: NOW });
    },
  );

  it("leaves pending a generation the cloud refused for a passing reason, and goes on to the next one", async () => {
    const { generations, cloud, upload } = setup();
    generations.hold(OLDER);
    generations.hold(NEWER);
    const accept = cloud.onDeclare;
    cloud.onDeclare = (declared) =>
      declared.generationId === NEWER_ID
        ? { kind: "refused", code: "snapshot_backups_unavailable" }
        : accept(declared);

    const outcome = await upload();

    expect(outcome).toEqual({
      kind: "every_pending_tried",
      tally: { uploaded: 1, refused: 0, failed: 1 },
      latestAnnouncedKeyVersion: 2,
    });
    expect(generations.find(NEWER_ID)).toMatchObject({ refusedAt: null, uploadedAt: null });
  });

  it("leaves pending a generation whose declaration failed, and goes on to the next one", async () => {
    const { generations, cloud, upload } = setup();
    generations.hold(OLDER);
    generations.hold(NEWER);
    const accept = cloud.onDeclare;
    cloud.onDeclare = (declared) =>
      declared.generationId === NEWER_ID ? { kind: "failed" } : accept(declared);

    const outcome = await upload();

    expect(outcome).toEqual({
      kind: "every_pending_tried",
      tally: { uploaded: 1, refused: 0, failed: 1 },
      latestAnnouncedKeyVersion: 2,
    });
    expect(generations.find(NEWER_ID)).toMatchObject({ refusedAt: null, uploadedAt: null });
  });

  it("records a generation whose object is gone as refused, without asking the cloud, as it can never be uploaded", async () => {
    const { events, generations, upload } = setup();
    generations.hold(NEWER, null);

    const outcome = await upload();

    expect(events).toEqual([{ kind: "mark_refused", generationId: NEWER_ID, at: NOW }]);
    expect(outcome).toEqual({
      kind: "every_pending_tried",
      tally: { uploaded: 0, refused: 1, failed: 0 },
    });
  });

  it("stops at the first generation when the cloud cannot be reached, leaving every one pending", async () => {
    const { events, generations, cloud, upload } = setup();
    generations.hold(OLDER);
    generations.hold(NEWER);
    cloud.onDeclare = () => ({ kind: "unreachable" });

    const outcome = await upload();

    expect(events).toEqual([{ kind: "declare", generationId: NEWER_ID }]);
    expect(outcome).toEqual({
      kind: "cloud_unreachable",
      tally: { uploaded: 0, refused: 0, failed: 1 },
    });
  });

  it("leaves pending a generation whose object the storage refused, without confirming it, and goes on", async () => {
    const { events, generations, cloud, upload } = setup();
    generations.hold(OLDER);
    generations.hold(NEWER);
    cloud.onPut = (authorization) =>
      authorization === `upload of ${NEWER_ID}` ? "failed" : "done";

    const outcome = await upload();

    expect(events).not.toContainEqual({ kind: "confirm", generationId: NEWER_ID });
    expect(outcome).toEqual({
      kind: "every_pending_tried",
      tally: { uploaded: 1, refused: 0, failed: 1 },
      latestAnnouncedKeyVersion: 2,
    });
    expect(generations.find(NEWER_ID)).toMatchObject({ uploadedAt: null, refusedAt: null });
  });

  it("stops when the storage cannot be reached", async () => {
    const { events, generations, cloud, upload } = setup();
    generations.hold(OLDER);
    generations.hold(NEWER);
    cloud.onPut = () => "unreachable";

    const outcome = await upload();

    expect(events.map((event) => event.kind)).toEqual(["declare", "put"]);
    expect(outcome).toEqual({
      kind: "cloud_unreachable",
      tally: { uploaded: 0, refused: 0, failed: 1 },
      latestAnnouncedKeyVersion: 2,
    });
  });

  it("leaves pending a generation whose confirmation failed, and goes on", async () => {
    const { generations, cloud, upload } = setup();
    generations.hold(OLDER);
    generations.hold(NEWER);
    cloud.onConfirm = (confirmed) => (confirmed.generationId === NEWER_ID ? "failed" : "done");

    const outcome = await upload();

    expect(outcome).toEqual({
      kind: "every_pending_tried",
      tally: { uploaded: 1, refused: 0, failed: 1 },
      latestAnnouncedKeyVersion: 2,
    });
    expect(generations.find(NEWER_ID)).toMatchObject({ uploadedAt: null });
  });

  it("stops when the confirmation cannot reach the cloud, leaving the generation pending", async () => {
    const { events, generations, cloud, upload } = setup();
    generations.hold(OLDER);
    generations.hold(NEWER);
    cloud.onConfirm = () => "unreachable";

    const outcome = await upload();

    expect(events.map((event) => event.kind)).toEqual(["declare", "put", "confirm"]);
    expect(outcome).toEqual({
      kind: "cloud_unreachable",
      tally: { uploaded: 0, refused: 0, failed: 1 },
      latestAnnouncedKeyVersion: 2,
    });
    expect(generations.find(NEWER_ID)).toMatchObject({ uploadedAt: null });
  });
});
