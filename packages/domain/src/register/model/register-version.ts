export interface RegisterVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function isNewerRegisterVersion(
  installed: RegisterVersion,
  offered: RegisterVersion,
): boolean {
  if (offered.major !== installed.major) {
    return offered.major > installed.major;
  }
  if (offered.minor !== installed.minor) {
    return offered.minor > installed.minor;
  }
  return offered.patch > installed.patch;
}
