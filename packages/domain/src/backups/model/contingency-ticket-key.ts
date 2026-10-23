import { latestKey, type VersionedKey } from "../../shared/index.js";

export function contingencyTicketSealingKey(
  heldKeys: readonly VersionedKey[],
): VersionedKey | undefined {
  return latestKey(heldKeys);
}
