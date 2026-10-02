export const PIN_HASH_SCHEME = {
  memoryKiB: 19456,
  passes: 2,
  parallelism: 1,
  saltLength: 16,
  hashLength: 32,
} as const;

export function encodePinHash(hash: Uint8Array): string {
  return btoa(String.fromCharCode(...hash))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function decodePinSalt(salt: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(salt) || salt.length % 4 === 1) {
    return undefined;
  }
  const padded = salt.replaceAll("-", "+").replaceAll("_", "/");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  if (bytes.length !== PIN_HASH_SCHEME.saltLength || encodePinHash(bytes) !== salt) {
    return undefined;
  }
  return bytes;
}
