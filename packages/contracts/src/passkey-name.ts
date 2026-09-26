export const PASSKEY_NAME_MAX_LENGTH = 40;

/**
 * Counts Unicode code points rather than UTF-16 units, so a single emoji counts once; a composed
 * emoji such as a flag or a family still counts once per code point. Mirrors `categoryNameLength`.
 */
export function passkeyNameLength(name: string): number {
  return Array.from(name).length;
}

export function isPasskeyNameTooLong(name: string): boolean {
  return passkeyNameLength(name) > PASSKEY_NAME_MAX_LENGTH;
}
