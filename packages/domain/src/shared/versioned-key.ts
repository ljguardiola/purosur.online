export interface VersionedKey {
  version: number;
  key: string;
}

export function inVersionOrder(keys: readonly VersionedKey[]): VersionedKey[] {
  return [...keys].sort((a, b) => a.version - b.version);
}

export function latestKey(keys: readonly VersionedKey[]): VersionedKey | undefined {
  return inVersionOrder(keys).at(-1);
}
