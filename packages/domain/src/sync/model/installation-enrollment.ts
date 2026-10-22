import { isInstallationRevoked, type SalesStopState } from "./sales-stop.js";

export type InstallationEnrollment =
  | { kind: "not_enrolled" }
  | { kind: "enrolled" }
  | { kind: "revoked" };

export function installationEnrollment({
  credentialsDeviceId,
  heldDeviceId,
  salesStop,
}: {
  credentialsDeviceId: string | undefined;
  heldDeviceId: string | undefined;
  salesStop: SalesStopState;
}): InstallationEnrollment {
  if (credentialsDeviceId === undefined) {
    return { kind: "not_enrolled" };
  }
  if (credentialsDeviceId === heldDeviceId && isInstallationRevoked(salesStop)) {
    return { kind: "revoked" };
  }
  return { kind: "enrolled" };
}
