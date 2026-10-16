import { latestKey, nextKeyVersion } from "../model/installation-key.js";
import type { RevokeLostRegisterPorts } from "./lost-register-revocation-ports.js";

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
    const revoked = await tx.revokeActiveInstallation(registerId, revokedAt);
    if (revoked === null) {
      return { kind: "no_active_installation" };
    }
    const held = await tx.lockRegisterKeys(registerId);
    const snapshotKeyVersion = nextKeyVersion(held.snapshotKeys);
    const contingencyTicketKeyVersion = nextKeyVersion(held.contingencyTicketKeys);
    await tx.recordSnapshotKey(registerId, { version: snapshotKeyVersion, key: keys.generate() });
    await tx.recordContingencyTicketKey(registerId, {
      version: contingencyTicketKeyVersion,
      key: keys.generate(),
    });
    await tx.requirePinResetOfBranchUsers(branchId, actorId);
    await tx.openRevocationAlert({ registerId, ...revoked });
    await tx.recordLostRegisterRevocation({
      registerId,
      deviceId: revoked.deviceId,
      revokedAt,
      actorId,
      snapshotKeyVersion: {
        previous: latestKey(held.snapshotKeys)?.version ?? null,
        current: snapshotKeyVersion,
      },
      contingencyTicketKeyVersion: {
        previous: latestKey(held.contingencyTicketKeys)?.version ?? null,
        current: contingencyTicketKeyVersion,
      },
    });
    return {
      kind: "revoked",
      deviceId: revoked.deviceId,
      revokedAt,
      snapshotKeyVersion,
      contingencyTicketKeyVersion,
    };
  });
}
