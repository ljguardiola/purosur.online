import { describe, expect, it } from "vitest";
import { resetSyncIdentityWithoutCopy } from "./reset-sync-identity-without-copy.js";
import {
  aFreshInstallationHoldingNothing,
  FakeNoCopySyncIdentityStore,
  type NoCopyStoreOperation,
} from "./test-support/fake-no-copy-sync-identity-store.js";

const INPUT = {
  deviceId: "new-device",
  registerId: "register-1",
  firstInstallationId: "first-device",
};

describe("resetSyncIdentityWithoutCopy", () => {
  it("reports the first installation as the predecessor", async () => {
    const store = new FakeNoCopySyncIdentityStore();

    const outcome = await resetSyncIdentityWithoutCopy({ store }, INPUT);

    expect(outcome).toEqual({ kind: "reset", predecessorDeviceId: "first-device" });
  });

  it("records the first installation as the predecessor with nothing acknowledged, not from a copy", async () => {
    const store = new FakeNoCopySyncIdentityStore();

    await resetSyncIdentityWithoutCopy({ store }, INPUT);

    expect(store.state.predecessor).toEqual({
      deviceId: "first-device",
      lastAcknowledgedSeq: 0,
      origin: "no_copy",
    });
  });

  it("adopts the new installation's identity with a fresh chain and leaves the pull cursor at zero", async () => {
    const store = new FakeNoCopySyncIdentityStore();

    await resetSyncIdentityWithoutCopy({ store }, INPUT);

    expect(store.state.identity).toEqual({
      deviceId: "new-device",
      outboxSequenceCounter: 0,
      eventChainHead: null,
    });
    expect(store.state.pullCursor).toBe(0);
  });

  it("holds the register for its restored numbering and its orphan sweep", async () => {
    const store = new FakeNoCopySyncIdentityStore();

    await resetSyncIdentityWithoutCopy({ store }, INPUT);

    expect(store.state.awaitingRestoredNumbering).toEqual(["register-1"]);
    expect(store.state.awaitingOrphanSweep).toEqual(["register-1"]);
  });

  it("records the predecessor, then adopts the identity, then holds the numbering, in one transaction", async () => {
    const store = new FakeNoCopySyncIdentityStore();

    await resetSyncIdentityWithoutCopy({ store }, INPUT);

    expect(store.operations).toEqual([
      "recordPredecessor",
      "adoptInstallationIdentity",
      "awaitRestoredNumbering",
    ]);
    expect(store.transactions).toBe(1);
  });

  it("changes nothing when the held identity already is the new installation's", async () => {
    const store = new FakeNoCopySyncIdentityStore();
    await resetSyncIdentityWithoutCopy({ store }, INPUT);
    const afterFirstRun = structuredClone(store.state);

    const outcome = await resetSyncIdentityWithoutCopy({ store }, INPUT);

    expect(outcome).toEqual({ kind: "already_reset" });
    expect(store.state).toEqual(afterFirstRun);
  });

  it.each<NoCopyStoreOperation>([
    "recordPredecessor",
    "adoptInstallationIdentity",
    "awaitRestoredNumbering",
  ])("leaves the database as it came when %s fails", async (operation) => {
    const store = new FakeNoCopySyncIdentityStore();
    store.failAt = operation;

    await expect(resetSyncIdentityWithoutCopy({ store }, INPUT)).rejects.toThrow(
      "storage unavailable",
    );

    expect(store.state).toEqual(aFreshInstallationHoldingNothing());
  });
});
