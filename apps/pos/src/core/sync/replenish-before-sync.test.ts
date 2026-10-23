import { describe, expect, it } from "vitest";
import { replenishBeforeSync } from "./replenish-before-sync";
import type { ReplenishAttempt } from "./replenish-restored-register-step";
import type { SyncResult } from "./sync-schedule";

function wiring(
  replenish: () => Promise<ReplenishAttempt>,
  identity: { held: boolean; pulledBySync: boolean } = { held: true, pulledBySync: false },
) {
  const calls: string[] = [];
  const reported: ReplenishAttempt[] = [];
  const failures: unknown[] = [];
  const run = replenishBeforeSync({
    holdsRegisterIdentity: () => identity.held,
    replenish: async () => {
      calls.push("replenish");
      return replenish();
    },
    report: (attempt) => reported.push(attempt),
    onFailure: (error) => failures.push(error),
    syncOnce: async (): Promise<SyncResult> => {
      calls.push("sync");
      identity.held ||= identity.pulledBySync;
      return { kind: "succeeded" };
    },
  });
  return { run, calls, reported, failures };
}

describe("replenishing a restored register before each sync", () => {
  it("replenishes first and then syncs, answering the sync's result", async () => {
    const { run, calls } = wiring(async () => ({ kind: "replenished" }));

    expect(await run()).toEqual({ kind: "succeeded" });
    expect(calls).toEqual(["replenish", "sync"]);
  });

  it("syncs even when the replenishment is not finished, to retry it with the next cycle", async () => {
    const { run, calls } = wiring(async () => ({ kind: "unreachable" }));

    await run();

    expect(calls).toEqual(["replenish", "sync"]);
  });

  it("reports what the replenishment did", async () => {
    const { run, reported } = wiring(async () => ({ kind: "partially_replenished", unapplied: 2 }));

    await run();

    expect(reported).toEqual([{ kind: "partially_replenished", unapplied: 2 }]);
  });

  it("reports a replenishment that threw and syncs anyway", async () => {
    const error = new Error("storage unavailable");
    const { run, calls, failures, reported } = wiring(async () => {
      throw error;
    });

    expect(await run()).toEqual({ kind: "succeeded" });
    expect(failures).toEqual([error]);
    expect(reported).toEqual([]);
    expect(calls).toEqual(["replenish", "sync"]);
  });

  it("syncs first and replenishes right after when the register's own identity is not pulled yet", async () => {
    const { run, calls, failures } = wiring(async () => ({ kind: "replenished" }), {
      held: false,
      pulledBySync: true,
    });

    expect(await run()).toEqual({ kind: "succeeded" });
    expect(calls).toEqual(["sync", "replenish"]);
    expect(failures).toEqual([]);
  });

  it("leaves the replenishment for a later cycle while the sync has not pulled the register's own identity", async () => {
    const { run, calls, reported, failures } = wiring(async () => ({ kind: "replenished" }), {
      held: false,
      pulledBySync: false,
    });

    expect(await run()).toEqual({ kind: "succeeded" });
    expect(calls).toEqual(["sync"]);
    expect(reported).toEqual([]);
    expect(failures).toEqual([]);
  });
});
