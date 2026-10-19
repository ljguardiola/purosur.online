import type { SnapshotWorkerMessage } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { endRestoreWorker } from "./restore-worker-message";

describe("endRestoreWorker", () => {
  it.each([
    { kind: "restored", generationId: "g", failures: [] },
    { kind: "no_generation" },
    { kind: "none_usable", failures: [] },
    { kind: "unreachable" },
  ] as const)("tells main the restore ended as $kind and waits for main to end it", (outcome) => {
    const posted: SnapshotWorkerMessage[] = [];

    endRestoreWorker(outcome, { post: (message) => posted.push(message) });

    expect(posted).toEqual([{ type: "snapshot-restore-finished", outcome: outcome.kind }]);
  });
});
