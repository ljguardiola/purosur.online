/** Derived from the account's own id (its 16 raw UUID bytes) instead of a random value the cloud
 * would then have to store. */
export function deriveUserHandle(userId: string): Uint8Array<ArrayBuffer> {
  const hex = userId.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
