import { describe, expect, it } from "vitest";
import type { RestorationEvidence } from "../model/restoration-protocol.js";
import { regularizeRestoredOrphanAuthorizations } from "./regularize-restored-orphan-authorizations.js";
import type { OrphanSweepAnswer } from "./regularize-restored-orphan-authorizations-ports.js";
import {
  FakeAwaitedOrphanSweep,
  FakeOrphanSweepRequester,
} from "./test-support/fake-orphan-sweep-request.js";
import {
  COMPLETED_RESTORATION,
  FakeRestorationProtocolEvidence,
} from "./test-support/fake-restoration-protocol-evidence.js";

const AT_THE_SWEEP: RestorationEvidence = {
  ...COMPLETED_RESTORATION,
  regularize_orphan_authorizations: "pending",
};

function scenario(evidence: RestorationEvidence, answer?: OrphanSweepAnswer<string>) {
  const cloud = new FakeOrphanSweepRequester(answer);
  const awaited = new FakeAwaitedOrphanSweep();
  const ports = { evidence: new FakeRestorationProtocolEvidence(evidence), cloud, awaited };
  return { cloud, awaited, ports };
}

describe("regularizeRestoredOrphanAuthorizations", () => {
  it("asks the cloud and stops awaiting the sweep once the cloud has swept", async () => {
    const { cloud, awaited, ports } = scenario(AT_THE_SWEEP, { kind: "swept" });

    expect(await regularizeRestoredOrphanAuthorizations(ports)).toEqual({ kind: "regularized" });
    expect(cloud.asks).toBe(1);
    expect(awaited.cleared).toBe(1);
  });

  it("keeps awaiting the sweep while the cloud has not reconciled the numbering", async () => {
    const { awaited, ports } = scenario(AT_THE_SWEEP, { kind: "numbering_not_reconciled" });

    expect(await regularizeRestoredOrphanAuthorizations(ports)).toEqual({
      kind: "numbering_not_reconciled",
    });
    expect(awaited.cleared).toBe(0);
  });

  it("keeps awaiting the sweep and names the failure when the cloud cannot be asked", async () => {
    const { awaited, ports } = scenario(AT_THE_SWEEP, { kind: "failed", failure: "unreachable" });

    expect(await regularizeRestoredOrphanAuthorizations(ports)).toEqual({
      kind: "failed",
      failure: "unreachable",
    });
    expect(awaited.cleared).toBe(0);
  });

  it("sweeps while the restoration waits without a connection at that step", async () => {
    const { cloud, awaited, ports } = scenario({ ...AT_THE_SWEEP, cloud: "unreachable" });

    expect(await regularizeRestoredOrphanAuthorizations(ports)).toEqual({ kind: "regularized" });
    expect(cloud.asks).toBe(1);
    expect(awaited.cleared).toBe(1);
  });

  it.each<[string, RestorationEvidence]>([
    ["is complete", COMPLETED_RESTORATION],
    ["is held at an earlier step", { ...AT_THE_SWEEP, reconcile_fiscal_counters: "pending" }],
    ["has not enrolled", { ...AT_THE_SWEEP, enroll: "pending" }],
    ["failed to restore", { ...AT_THE_SWEEP, restore: "failed" }],
  ])("does nothing when the restoration %s", async (_case, evidence) => {
    const { cloud, awaited, ports } = scenario(evidence);

    expect(await regularizeRestoredOrphanAuthorizations(ports)).toEqual({ kind: "not_this_step" });
    expect(cloud.asks).toBe(0);
    expect(awaited.cleared).toBe(0);
  });
});
