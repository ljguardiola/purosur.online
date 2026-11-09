export interface RegisterVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function isNewerParts(installed: readonly bigint[], offered: readonly bigint[]): boolean {
  for (const [index, part] of offered.entries()) {
    const installedPart = installed[index] ?? 0n;
    if (part > installedPart) {
      return true;
    }
    if (part < installedPart) {
      return false;
    }
  }
  return false;
}

function partsOf({ major, minor, patch }: RegisterVersion): bigint[] {
  return [major, minor, patch].map((part) => BigInt(part));
}

function textParts(version: string): bigint[] | undefined {
  const match = VERSION_PATTERN.exec(version);
  return match === null ? undefined : match.slice(1).map((part) => BigInt(part));
}

export function isNewerRegisterVersion(
  installed: RegisterVersion,
  offered: RegisterVersion,
): boolean {
  return isNewerParts(partsOf(installed), partsOf(offered));
}

export function isWellFormedRegisterVersion(version: string): boolean {
  return VERSION_PATTERN.test(version);
}

export function isRegisterVersionAtLeast(version: string, minimum: string): boolean {
  const parts = textParts(version);
  const minimumParts = textParts(minimum);
  return parts !== undefined && minimumParts !== undefined && !isNewerParts(parts, minimumParts);
}
