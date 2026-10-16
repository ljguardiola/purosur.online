import { latestKey, nextKeyVersion } from "../model/installation-key.js";
import type { RotateRegisterSnapshotKeyPorts } from "./snapshot-key-rotation-ports.js";

export interface RotateRegisterSnapshotKeyInput {
  registerId: string;
  actorId: string;
}

export type RotateRegisterSnapshotKeyOutcome =
  | { kind: "register_not_found" }
  | { kind: "no_key_yet" }
  | { kind: "rotated"; keyVersion: number };

export async function rotateRegisterSnapshotKey(
  { store, keys }: RotateRegisterSnapshotKeyPorts,
  { registerId, actorId }: RotateRegisterSnapshotKeyInput,
): Promise<RotateRegisterSnapshotKeyOutcome> {
  return store.transaction<RotateRegisterSnapshotKeyOutcome>(async (tx) => {
    const held = await tx.lockRegisterSnapshotKeys(registerId);
    if (held === undefined) {
      return { kind: "register_not_found" };
    }
    const latest = latestKey(held);
    if (latest === undefined) {
      return { kind: "no_key_yet" };
    }
    const keyVersion = nextKeyVersion(held);
    await tx.recordSnapshotKey(registerId, { version: keyVersion, key: keys.generate() });
    await tx.recordSnapshotKeyRotation({
      registerId,
      previousVersion: latest.version,
      newVersion: keyVersion,
      actorId,
    });
    return { kind: "rotated", keyVersion };
  });
}
