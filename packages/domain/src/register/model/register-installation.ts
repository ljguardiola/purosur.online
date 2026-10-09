export interface RegisterInstallationRecord {
  hostname: string;
  windowsVersion: string;
  enrolledAt: Date;
  revokedAt: Date | null;
}

export type RegisterInstallationState =
  | { kind: "not_enrolled" }
  | { kind: "enrolled"; hostname: string; windowsVersion: string; enrolledAt: Date }
  | {
      kind: "revoked";
      hostname: string;
      windowsVersion: string;
      enrolledAt: Date;
      revokedAt: Date;
    };

export function registerInstallationState(
  latestInstallation: RegisterInstallationRecord | null,
): RegisterInstallationState {
  if (latestInstallation === null) {
    return { kind: "not_enrolled" };
  }
  const { hostname, windowsVersion, enrolledAt, revokedAt } = latestInstallation;
  return revokedAt === null
    ? { kind: "enrolled", hostname, windowsVersion, enrolledAt }
    : { kind: "revoked", hostname, windowsVersion, enrolledAt, revokedAt };
}
