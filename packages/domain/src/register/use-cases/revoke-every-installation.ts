import type { RevokeEveryInstallationPorts } from "./every-installation-revocation-ports.js";
import { revokeInstallationAndRotateKeys } from "./revoke-installation-and-rotate-keys.js";

export interface RevokeEveryInstallationInput {
  actorId: string;
}

export interface RevokedRegister {
  registerId: string;
  deviceId: string;
  snapshotKeyVersion: number;
  contingencyTicketKeyVersion: number;
}

export type RevokeEveryInstallationOutcome =
  | { kind: "nothing_to_revoke" }
  | { kind: "revoked"; revokedAt: Date; registers: RevokedRegister[] };

export async function revokeEveryInstallation(
  { store, clock, keys }: RevokeEveryInstallationPorts,
  { actorId }: RevokeEveryInstallationInput,
): Promise<RevokeEveryInstallationOutcome> {
  return store.transaction<RevokeEveryInstallationOutcome>(async (tx) => {
    const registerIds = await tx.lockEveryRegister();
    const revokedAt = clock.now();
    const registers: RevokedRegister[] = [];
    for (const registerId of registerIds) {
      const revoked = await revokeInstallationAndRotateKeys(tx, keys, registerId, revokedAt);
      if (revoked === null) {
        continue;
      }
      const { installation, snapshotKeyVersion, contingencyTicketKeyVersion } = revoked;
      await tx.openRevocationAlert({ registerId, ...installation });
      await tx.recordEveryInstallationRevocation({
        registerId,
        deviceId: installation.deviceId,
        revokedAt,
        actorId,
        snapshotKeyVersion,
        contingencyTicketKeyVersion,
      });
      registers.push({
        registerId,
        deviceId: installation.deviceId,
        snapshotKeyVersion: snapshotKeyVersion.current,
        contingencyTicketKeyVersion: contingencyTicketKeyVersion.current,
      });
    }
    if (registers.length === 0) {
      return { kind: "nothing_to_revoke" };
    }
    return { kind: "revoked", revokedAt, registers };
  });
}
