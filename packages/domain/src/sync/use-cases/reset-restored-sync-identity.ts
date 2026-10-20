import type { ResetRestoredSyncIdentityPorts } from "./restored-sync-identity-ports.js";

export interface ResetRestoredSyncIdentityInput {
  deviceId: string;
}

export type ResetRestoredSyncIdentityOutcome =
  | { kind: "reset"; predecessorDeviceId: string; lastAcknowledgedSeq: number }
  | { kind: "already_reset" };

export async function resetRestoredSyncIdentity(
  { store }: ResetRestoredSyncIdentityPorts,
  { deviceId }: ResetRestoredSyncIdentityInput,
): Promise<ResetRestoredSyncIdentityOutcome> {
  return store.transaction<ResetRestoredSyncIdentityOutcome>(async (tx) => {
    const carried = await tx.carriedIdentity();
    if (carried.deviceId === deviceId) {
      return { kind: "already_reset" };
    }
    await tx.recordPredecessor(carried);
    await tx.discardCarriedOutboxEvents();
    await tx.adoptInstallationIdentity(deviceId);
    await tx.discardCarriedPinVerifiers();
    return {
      kind: "reset",
      predecessorDeviceId: carried.deviceId,
      lastAcknowledgedSeq: carried.lastAcknowledgedSeq,
    };
  });
}
