import { describe, expect, it } from "vitest";
import { snapshotWorkerMessageOf } from "./snapshot-worker-message";

describe("snapshotWorkerMessageOf", () => {
  it.each(["copy", "integrity_check", "foreign_key_check"] as const)(
    "tells main that the copy failed at %s when the job was aborted there",
    (stage) => {
      expect(snapshotWorkerMessageOf({ kind: "aborted", stage })).toEqual({
        type: "snapshot-copy-failed",
        stage,
      });
    },
  );

  it("tells main nothing of a job that completed", () => {
    expect(
      snapshotWorkerMessageOf({
        kind: "completed",
        uploads: { kind: "every_pending_tried", tally: { uploaded: 1, refused: 0, failed: 0 } },
      }),
    ).toBeUndefined();
  });
});
