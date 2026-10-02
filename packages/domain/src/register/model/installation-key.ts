export const INSTALLATION_KEY_BYTES = 32;

export const FIRST_KEY_VERSION = 1;

export interface VersionedKey {
  version: number;
  key: string;
}

// 32 bytes are 43 base64 characters and one "=": the last character carries 4 bits and 2 zero
// bits of padding, so only the characters whose value is a multiple of 4 can stand there.
const ENCODED_INSTALLATION_KEY = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;

export function isWellFormedInstallationKey(encoded: string): boolean {
  return ENCODED_INSTALLATION_KEY.test(encoded);
}

export function hasDistinctKeyVersions(keys: readonly VersionedKey[]): boolean {
  return new Set(keys.map((key) => key.version)).size === keys.length;
}

export function inVersionOrder(keys: readonly VersionedKey[]): VersionedKey[] {
  return [...keys].sort((a, b) => a.version - b.version);
}

export function latestKey(keys: readonly VersionedKey[]): VersionedKey | undefined {
  return inVersionOrder(keys).at(-1);
}
