export const MINIMUM_ACCEPTED_REGISTER_VERSION = "0.0.0";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function versionParts(version: string): bigint[] | undefined {
  const match = VERSION_PATTERN.exec(version);
  return match === null ? undefined : match.slice(1).map((part) => BigInt(part));
}

export function versionAtLeast(version: string, minimum: string): boolean {
  const parts = versionParts(version);
  const minimumParts = versionParts(minimum);
  if (parts === undefined || minimumParts === undefined) {
    return false;
  }
  for (const [index, part] of parts.entries()) {
    const minimumPart = minimumParts[index] ?? 0n;
    if (part < minimumPart) {
      return false;
    }
    if (part > minimumPart) {
      return true;
    }
  }
  return true;
}

export function registerVersionAccepted(appVersion: string): boolean {
  return versionAtLeast(appVersion, MINIMUM_ACCEPTED_REGISTER_VERSION);
}

export function isWellFormedRegisterVersion(version: string): boolean {
  return VERSION_PATTERN.test(version);
}

export function isLeftBehindByMinimum(reportedVersion: string | null, minimum: string): boolean {
  return reportedVersion === null || !versionAtLeast(reportedVersion, minimum);
}
