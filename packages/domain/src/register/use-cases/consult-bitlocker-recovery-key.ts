import type { BitlockerRecoveryKeyPorts } from "./bitlocker-recovery-key-ports.js";

export interface ConsultBitlockerRecoveryKeyInput {
  branchId: string;
  registerId: string;
  actorId: string;
}

export type ConsultBitlockerRecoveryKeyOutcome =
  | { kind: "register_not_found" }
  | { kind: "no_current_installation" }
  | { kind: "not_loaded" }
  | { kind: "consulted"; installationId: string; recoveryKey: string; keyIdentifier: string };

export async function consultBitlockerRecoveryKey(
  { store, clock }: BitlockerRecoveryKeyPorts,
  { branchId, registerId, actorId }: ConsultBitlockerRecoveryKeyInput,
): Promise<ConsultBitlockerRecoveryKeyOutcome> {
  return store.transaction<ConsultBitlockerRecoveryKeyOutcome>(async (tx) => {
    if (!(await tx.lockBranchRegister(branchId, registerId))) {
      return { kind: "register_not_found" };
    }
    const installationId = await tx.currentInstallationOf(registerId);
    if (installationId === null) {
      return { kind: "no_current_installation" };
    }
    const held = await tx.recoveryKeyOf(installationId);
    if (held === null) {
      return { kind: "not_loaded" };
    }
    await tx.recordRecoveryKeyConsulted({
      registerId,
      installationId,
      actorId,
      at: clock.now(),
    });
    return { kind: "consulted", installationId, ...held };
  });
}
