import { describe, expect, it } from "vitest";
import type { RestorationEvidence } from "../../register/index.js";
import { awaitContingencyTicketRecovery } from "./await-contingency-ticket-recovery.js";
import type {
  ContingencyTicketRecoveryPredecessor,
  ContingencyTicketRecoveryStatus,
} from "./await-contingency-ticket-recovery-ports.js";
import {
  COMPLETED_RESTORATION,
  FakeAwaitedContingencyTicketRecovery,
  FakeContingencyTicketRecoveryRequester,
  FakeRestorationEvidenceReader,
} from "./test-support/fake-awaited-contingency-ticket-recovery.js";

const AT_THE_RECOVERY: RestorationEvidence = {
  ...COMPLETED_RESTORATION,
  recover_contingency_tickets: "pending",
  reconcile_fiscal_counters: "pending",
  regularize_orphan_authorizations: "pending",
};

const PREDECESSOR: ContingencyTicketRecoveryPredecessor = {
  deviceId: "0190a000-0000-7000-8000-000000000001",
  lastAcknowledgedSeq: 41,
};

function scenario(
  evidence: RestorationEvidence,
  status?: ContingencyTicketRecoveryStatus<string>,
  awaiting: ContingencyTicketRecoveryPredecessor | undefined = PREDECESSOR,
) {
  const cloud = new FakeContingencyTicketRecoveryRequester(status);
  const awaited = new FakeAwaitedContingencyTicketRecovery(awaiting);
  return {
    cloud,
    awaited,
    ports: { restoration: new FakeRestorationEvidenceReader(evidence), cloud, awaited },
  };
}

describe("awaitContingencyTicketRecovery", () => {
  it("asks the cloud about the kept predecessor and releases it once the recovery is finished", async () => {
    const { cloud, awaited, ports } = scenario(AT_THE_RECOVERY, { kind: "finished" });

    expect(await awaitContingencyTicketRecovery(ports)).toEqual({ kind: "released" });
    expect(cloud.asked).toEqual([PREDECESSOR.deviceId]);
    expect(awaited.released).toEqual([PREDECESSOR]);
  });

  it("keeps waiting while the cloud's recovery is not finished", async () => {
    const { awaited, ports } = scenario(AT_THE_RECOVERY, { kind: "awaiting" });

    expect(await awaitContingencyTicketRecovery(ports)).toEqual({ kind: "awaiting" });
    expect(awaited.released).toEqual([]);
  });

  it("keeps waiting and names the failure when the cloud cannot be asked", async () => {
    const { awaited, ports } = scenario(AT_THE_RECOVERY, { kind: "failed", failure: "refused" });

    expect(await awaitContingencyTicketRecovery(ports)).toEqual({
      kind: "failed",
      failure: "refused",
    });
    expect(awaited.released).toEqual([]);
  });

  it("asks while the restoration waits without a connection at that step", async () => {
    const { cloud, awaited, ports } = scenario({ ...AT_THE_RECOVERY, cloud: "unreachable" });

    expect(await awaitContingencyTicketRecovery(ports)).toEqual({ kind: "released" });
    expect(cloud.asked).toHaveLength(1);
    expect(awaited.released).toHaveLength(1);
  });

  it.each<[string, RestorationEvidence]>([
    ["is complete", COMPLETED_RESTORATION],
    ["is held at the replenishment", { ...AT_THE_RECOVERY, replenish: "pending" }],
    ["is held at an earlier step", { ...AT_THE_RECOVERY, reset_sync_identity: "pending" }],
    ["has not enrolled", { ...AT_THE_RECOVERY, enroll: "pending" }],
    ["failed to restore", { ...AT_THE_RECOVERY, restore: "failed" }],
  ])("does nothing when the restoration %s", async (_case, evidence) => {
    const { cloud, awaited, ports } = scenario(evidence);

    expect(await awaitContingencyTicketRecovery(ports)).toEqual({ kind: "not_this_step" });
    expect(cloud.asked).toEqual([]);
    expect(awaited.released).toEqual([]);
  });

  it("does nothing when no predecessor is kept for the recovery", async () => {
    const { cloud, ports } = scenario(AT_THE_RECOVERY, undefined, undefined);

    expect(await awaitContingencyTicketRecovery(ports)).toEqual({ kind: "not_this_step" });
    expect(cloud.asked).toEqual([]);
  });
});
