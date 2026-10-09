import { installationService, isOutOfService } from "./register-service.js";

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
  installations: readonly RegisterInstallationRecord[],
): RegisterInstallationState {
  const inService = installations.find(
    (installation) => installationService(installation).kind === "in_service",
  );
  if (inService !== undefined) {
    const { hostname, windowsVersion, enrolledAt } = inService;
    return { kind: "enrolled", hostname, windowsVersion, enrolledAt };
  }
  const revoked = installations.filter(isOutOfService);
  const lastRevokedAt = Math.max(...revoked.map(({ revokedAt }) => revokedAt.getTime()));
  const lastRevoked = revoked.find(({ revokedAt }) => revokedAt.getTime() === lastRevokedAt);
  if (lastRevoked === undefined) {
    return { kind: "not_enrolled" };
  }
  const { hostname, windowsVersion, enrolledAt, revokedAt } = lastRevoked;
  return { kind: "revoked", hostname, windowsVersion, enrolledAt, revokedAt };
}
