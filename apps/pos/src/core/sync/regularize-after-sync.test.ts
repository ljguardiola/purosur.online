import { describe, expect, it } from "vitest";
import type { OrphanSweepAttempt } from "../register/regularize-orphan-authorizations-step";
import { regularizeAfterSync } from "./regularize-after-sync";
import type { SyncResult } from "./sync-schedule";

function wiring(regularize: () => Promise<OrphanSweepAttempt>) {
  const calls: string[] = [];
  const reported: OrphanSweepAttempt[] = [];
  const failures: unknown[] = [];
  const run = regularizeAfterSync({
    regularize: async () => {
      calls.push("regularize");
      return regularize();
    },
    report: (attempt) => reported.push(attempt),
    onFailure: (error) => failures.push(error),
    syncOnce: async (): Promise<SyncResult> => {
      calls.push("sync");
      return { kind: "succeeded" };
    },
  });
  return { run, calls, reported, failures };
}

describe("regularizing the orphan authorizations of a restored register after each sync", () => {
  it("syncs first and then regularizes, answering the sync's result", async () => {
    const { run, calls } = wiring(async () => ({ kind: "regularized" }));

    expect(await run()).toEqual({ kind: "succeeded" });
    expect(calls).toEqual(["sync", "regularize"]);
  });

  it("reports what the regularization did", async () => {
    const { run, reported } = wiring(async () => ({ kind: "numbering_not_reconciled" }));

    await run();

    expect(reported).toEqual([{ kind: "numbering_not_reconciled" }]);
  });

  it("reports a regularization that threw and still answers the sync's result", async () => {
    const error = new Error("storage unavailable");
    const { run, failures, reported } = wiring(async () => {
      throw error;
    });

    expect(await run()).toEqual({ kind: "succeeded" });
    expect(failures).toEqual([error]);
    expect(reported).toEqual([]);
  });
});
