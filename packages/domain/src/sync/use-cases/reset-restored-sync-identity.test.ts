import { describe, expect, it } from "vitest";
import { resetRestoredSyncIdentity } from "./reset-restored-sync-identity.js";
import {
  aSnapshotOfAnOldInstallation,
  FakeRestoredSyncIdentityStore,
  type FakeStoreOperation,
} from "./test-support/fake-restored-sync-identity-store.js";

const NEW_DEVICE = "new-device";

describe("resetRestoredSyncIdentity", () => {
  it("reports the old installation and the last sequence the cloud acknowledged from it", async () => {
    const store = new FakeRestoredSyncIdentityStore();

    const outcome = await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    expect(outcome).toEqual({
      kind: "reset",
      predecessorDeviceId: "old-device",
      lastAcknowledgedSeq: 52,
    });
  });

  it("records the old installation as the predecessor with its last acknowledged sequence", async () => {
    const store = new FakeRestoredSyncIdentityStore();

    await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    expect(store.state.predecessor).toEqual({ deviceId: "old-device", lastAcknowledgedSeq: 52 });
  });

  it("makes the identity the new installation's with both sequences at zero and a fresh event chain", async () => {
    const store = new FakeRestoredSyncIdentityStore();

    await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    expect(store.state.identity).toEqual({
      deviceId: NEW_DEVICE,
      outboxSequenceCounter: 0,
      acknowledgedSeq: 0,
      eventChainHead: null,
    });
  });

  it("discards every outbox event carried in by the snapshot", async () => {
    const store = new FakeRestoredSyncIdentityStore();

    await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    expect(store.state.outboxDeviceSeqs).toEqual([]);
  });

  it("discards the PIN verifiers carried in by the snapshot and the wrong PINs counted against them", async () => {
    const store = new FakeRestoredSyncIdentityStore();

    await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    expect(store.state.pinVerifiers).toEqual([]);
    expect(store.state.wrongPinAttempts).toBe(0);
  });

  it("keeps the pull cursor as the snapshot left it", async () => {
    const store = new FakeRestoredSyncIdentityStore();

    await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    expect(store.state.pullCursor).toBe(4_321);
  });

  it("does everything in one transaction", async () => {
    const store = new FakeRestoredSyncIdentityStore();

    await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    expect(store.transactions).toBe(1);
  });

  it("changes nothing when the identity already is the new installation's", async () => {
    const reset = new FakeRestoredSyncIdentityStore();
    await resetRestoredSyncIdentity({ store: reset }, { deviceId: NEW_DEVICE });
    const afterFirstRun = structuredClone(reset.state);

    const outcome = await resetRestoredSyncIdentity({ store: reset }, { deviceId: NEW_DEVICE });

    expect(outcome).toEqual({ kind: "already_reset" });
    expect(reset.state).toEqual(afterFirstRun);
  });

  it("keeps the predecessor of the first run when it runs again", async () => {
    const store = new FakeRestoredSyncIdentityStore();
    await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    await resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE });

    expect(store.state.predecessor).toEqual({ deviceId: "old-device", lastAcknowledgedSeq: 52 });
  });

  it.each<FakeStoreOperation>([
    "recordPredecessor",
    "discardCarriedOutboxEvents",
    "adoptInstallationIdentity",
    "discardCarriedPinVerifiers",
  ])("leaves the snapshot exactly as it came when %s fails", async (operation) => {
    const store = new FakeRestoredSyncIdentityStore();
    store.failAt = operation;

    await expect(resetRestoredSyncIdentity({ store }, { deviceId: NEW_DEVICE })).rejects.toThrow(
      "storage unavailable",
    );

    expect(store.state).toEqual(aSnapshotOfAnOldInstallation());
  });
});
