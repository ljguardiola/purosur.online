import type { BitlockerRecoveryKeyPorts } from "./bitlocker-recovery-key-ports.js";

export interface LoadBitlockerRecoveryKeyInput {
  branchId: string;
  registerId: string;
  actorId: string;
  recoveryKey: string;
  keyIdentifier: string;
}

export type LoadBitlockerRecoveryKeyOutcome =
  | { kind: "register_not_found" }
  | { kind: "no_current_installation" }
  | { kind: "already_loaded" }
  | { kind: "loaded"; installationId: string; loadedAt: Date };

export async function loadBitlockerRecoveryKey(
  { store, clock }: BitlockerRecoveryKeyPorts,
  { branchId, registerId, actorId, recoveryKey, keyIdentifier }: LoadBitlockerRecoveryKeyInput,
): Promise<LoadBitlockerRecoveryKeyOutcome> {
  return store.transaction<LoadBitlockerRecoveryKeyOutcome>(async (tx) => {
    if (!(await tx.lockBranchRegister(branchId, registerId))) {
      return { kind: "register_not_found" };
    }
    const installationId = await tx.currentInstallationOf(registerId);
    if (installationId === null) {
      return { kind: "no_current_installation" };
    }
    if (await tx.hasRecoveryKey(installationId)) {
      return { kind: "already_loaded" };
    }
    const loadedAt = clock.now();
    await tx.storeRecoveryKey({
      installationId,
      recoveryKey,
      keyIdentifier,
      loadedAt,
      loadedBy: actorId,
    });
    await tx.recordRecoveryKeyLoaded({ registerId, installationId, actorId, at: loadedAt });
    return { kind: "loaded", installationId, loadedAt };
  });
}
