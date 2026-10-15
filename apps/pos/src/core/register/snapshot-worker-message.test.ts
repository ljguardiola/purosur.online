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

  it("tells main nothing of a job that completed and exits on its own", () => {
    const { posted, exits } = end({
      kind: "completed",
      uploads: { kind: "every_pending_tried", tally: { uploaded: 1, refused: 0, failed: 0 } },
    });

    expect(posted).toEqual([]);
    expect(exits).toEqual([0]);
  });
});
