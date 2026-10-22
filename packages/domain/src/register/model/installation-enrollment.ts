import type { SalesStopReason, SalesStopState } from "../../sync/index.js";

export type InstallationEnrollment =
  | { kind: "not_enrolled" }
  | { kind: "enrolled" }
  | { kind: "revoked"; reason: SalesStopReason | undefined };

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
  if (credentialsDeviceId === heldDeviceId && salesStop.stopped) {
    return { kind: "revoked", reason: salesStop.reason };
  }
  return { kind: "enrolled" };
}
