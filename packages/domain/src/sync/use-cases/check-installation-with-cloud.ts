import type { CheckInstallationPorts, CloudInstallationStanding } from "./sync-ports.js";

export type CheckInstallationOutcome<TFailure> = CloudInstallationStanding<TFailure>;

export async function checkInstallationWithCloud<TFailure>({
  installation,
  cloud,
}: CheckInstallationPorts<TFailure>): Promise<CheckInstallationOutcome<TFailure>> {
  const standing = await cloud.standing();
  if (standing.kind === "revoked") {
    await installation.recordRevoked();
  }
  return standing;
}
