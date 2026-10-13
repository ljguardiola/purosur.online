export interface RegisterVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function isNewerRegisterVersion(
  installed: RegisterVersion,
  offered: RegisterVersion,
): boolean {
  const differences = [
    offered.major - installed.major,
    offered.minor - installed.minor,
    offered.patch - installed.patch,
  ];
  return (differences.find((difference) => difference !== 0) ?? 0) > 0;
}
