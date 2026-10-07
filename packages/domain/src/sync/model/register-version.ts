export const MINIMUM_ACCEPTED_REGISTER_VERSION = "0.0.0";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function versionParts(version: string): [bigint, bigint, bigint] | undefined {
  const match = VERSION_PATTERN.exec(version);
  if (match === null) {
    return undefined;
  }
  return [BigInt(match[1] ?? ""), BigInt(match[2] ?? ""), BigInt(match[3] ?? "")];
}

export function versionAtLeast(version: string, minimum: string): boolean {
  const parts = versionParts(version);
  const minimumParts = versionParts(minimum);
  if (parts === undefined || minimumParts === undefined) {
    return false;
  }
  for (const [index, part] of parts.entries()) {
    const minimumPart = minimumParts[index] ?? 0n;
    if (part !== minimumPart) {
      return part > minimumPart;
    }
  }
  return true;
}

export function registerVersionAccepted(appVersion: string): boolean {
  return versionAtLeast(appVersion, MINIMUM_ACCEPTED_REGISTER_VERSION);
}
