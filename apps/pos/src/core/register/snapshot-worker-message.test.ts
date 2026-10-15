import { describe, expect, it } from "vitest";
import type { SnapshotJobResult } from "./run-snapshot-job";
import { endSnapshotWorker } from "./snapshot-worker-message";

function end(result: SnapshotJobResult) {
  const posted: unknown[] = [];
  const exits: number[] = [];
  endSnapshotWorker(result, {
    post: (message) => posted.push(message),
    exit: (code) => exits.push(code),
  });
  return { posted, exits };
}

describe("endSnapshotWorker", () => {
  it.each(["copy", "integrity_check", "foreign_key_check"] as const)(
    "tells main that the copy failed at %s and waits for main to end it",
    (stage) => {
      const { posted, exits } = end({ kind: "aborted", stage });

      expect(posted).toEqual([{ type: "snapshot-copy-failed", stage }]);
      expect(exits).toEqual([]);
    },
  );

  it("tells main nothing of a job that completed without an announced key version and exits on its own", () => {
    const { posted, exits } = end({
      kind: "completed",
      uploads: {
        kind: "every_pending_tried",
        tally: { uploaded: 1, refused: 0, failed: 0 },
        latestAnnouncedKeyVersion: undefined,
      },
      latestAnnouncedKeyVersion: undefined,
    });

    expect(posted).toEqual([]);
    expect(exits).toEqual([0]);
  });

  it.each(["every_pending_tried", "cloud_unreachable"] as const)(
    "tells main the latest key version the cloud announced when the upload pass ended as %s, and waits for main to end it",
    (kind) => {
      const { posted, exits } = end({
        kind: "completed",
        uploads: {
          kind,
          tally: { uploaded: 0, refused: 0, failed: 1 },
          latestAnnouncedKeyVersion: 3,
        },
        latestAnnouncedKeyVersion: 3,
      });

      expect(posted).toEqual([{ type: "snapshot-key-version-announced", version: 3 }]);
      expect(exits).toEqual([]);
    },
  );

  it("tells main the key version the job learned before taking a snapshot, even when no upload announced one", () => {
    const { posted, exits } = end({
      kind: "completed",
      uploads: {
        kind: "every_pending_tried",
        tally: { uploaded: 0, refused: 0, failed: 0 },
        latestAnnouncedKeyVersion: undefined,
      },
      latestAnnouncedKeyVersion: 3,
    });

    expect(posted).toEqual([{ type: "snapshot-key-version-announced", version: 3 }]);
    expect(exits).toEqual([]);
  });
});
