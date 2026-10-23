import type { ResetSyncIdentityWithoutCopyPorts } from "./reset-sync-identity-without-copy-ports.js";

export interface ResetSyncIdentityWithoutCopyInput {
  deviceId: string;
  registerId: string;
  firstInstallationId: string;
}

export type ResetSyncIdentityWithoutCopyOutcome =
  | { kind: "reset"; predecessorDeviceId: string }
  | { kind: "already_reset" };

export async function resetSyncIdentityWithoutCopy(
  { store }: ResetSyncIdentityWithoutCopyPorts,
  { deviceId, registerId, firstInstallationId }: ResetSyncIdentityWithoutCopyInput,
): Promise<ResetSyncIdentityWithoutCopyOutcome> {
  return store.transaction<ResetSyncIdentityWithoutCopyOutcome>(async (tx) => {
    if ((await tx.heldDeviceId()) === deviceId) {
      return { kind: "already_reset" };
    }
    await tx.recordPredecessor({ deviceId: firstInstallationId, lastAcknowledgedSeq: 0 });
    await tx.adoptInstallationIdentity(deviceId);
    await tx.awaitRestoredNumbering(registerId);
    return { kind: "reset", predecessorDeviceId: firstInstallationId };
  });
}
