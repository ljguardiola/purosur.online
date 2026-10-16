import type { RevokeLostRegisterPorts } from "./lost-register-revocation-ports.js";
import { revokeInstallationAndRotateKeys } from "./revoke-installation-and-rotate-keys.js";

export interface RevokeLostRegisterInput {
  branchId: string;
  registerId: string;
  actorId: string;
}

export type RevokeLostRegisterOutcome =
  | { kind: "register_not_found" }
  | { kind: "no_active_installation" }
  | {
      kind: "revoked";
      deviceId: string;
      revokedAt: Date;
      snapshotKeyVersion: number;
      contingencyTicketKeyVersion: number;
    };

export async function revokeLostRegister(
  { store, clock, keys }: RevokeLostRegisterPorts,
  { branchId, registerId, actorId }: RevokeLostRegisterInput,
): Promise<RevokeLostRegisterOutcome> {
  return store.transaction<RevokeLostRegisterOutcome>(async (tx) => {
    if (!(await tx.lockBranchRegister(branchId, registerId))) {
      return { kind: "register_not_found" };
    }
    const revokedAt = clock.now();
    const revoked = await revokeInstallationAndRotateKeys(tx, keys, registerId, revokedAt);
    if (revoked === null) {
      return { kind: "no_active_installation" };
    }
    const { installation, snapshotKeyVersion, contingencyTicketKeyVersion } = revoked;
    await tx.requirePinResetOfBranchUsers(branchId, actorId);
    await tx.openRevocationAlert({ registerId, ...installation });
    await tx.recordLostRegisterRevocation({
      registerId,
      deviceId: installation.deviceId,
      revokedAt,
      actorId,
      snapshotKeyVersion,
      contingencyTicketKeyVersion,
    });
    return {
      kind: "revoked",
      deviceId: installation.deviceId,
      revokedAt,
      snapshotKeyVersion: snapshotKeyVersion.current,
      contingencyTicketKeyVersion: contingencyTicketKeyVersion.current,
    };
  });
}
