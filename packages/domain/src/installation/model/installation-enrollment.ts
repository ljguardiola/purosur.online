export type InstallationEnrollment =
  | { kind: "not_enrolled" }
  | { kind: "enrolled" }
  | { kind: "revoked" };

export function installationEnrollment({
  credentialsDeviceId,
  heldDeviceId,
  installationRevoked,
}: {
  credentialsDeviceId: string | undefined;
  heldDeviceId: string | undefined;
  installationRevoked: boolean;
}): InstallationEnrollment {
  if (credentialsDeviceId === undefined) {
    return { kind: "not_enrolled" };
  }
  if (credentialsDeviceId === heldDeviceId && installationRevoked) {
    return { kind: "revoked" };
  }
  return { kind: "enrolled" };
}
