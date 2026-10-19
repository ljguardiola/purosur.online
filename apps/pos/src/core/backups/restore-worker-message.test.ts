import type { SnapshotWorkerMessage } from "@purosur/contracts";
import type { RestoreNewestSnapshotGenerationOutcome } from "@purosur/domain/backups/use-cases";
import { describe, expect, it } from "vitest";
import { endRestoreWorker } from "./restore-worker-message";

describe("endRestoreWorker", () => {
  const outcomes: RestoreNewestSnapshotGenerationOutcome[] = [
    { kind: "restored", generationId: "g", failures: [] },
    { kind: "no_generation" },
    { kind: "none_usable", failures: [] },
    { kind: "unreachable" },
  ];

  it.each(outcomes)(
    "tells main the restore ended as $kind and waits for main to end it",
    (outcome) => {
      const posted: SnapshotWorkerMessage[] = [];

      endRestoreWorker(outcome, { post: (message) => posted.push(message) });

      expect(posted).toEqual([{ type: "snapshot-restore-finished", outcome: outcome.kind }]);
    },
  );
});
