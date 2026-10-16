import { latestKeyVersion } from "../model/installation-key.js";
import type { SnapshotStore } from "./snapshot-generations.js";

export interface CurrentSnapshotKeyVersionPorts {
  store: SnapshotStore;
}

export interface CurrentSnapshotKeyVersionInput {
  registerId: string;
}

export type CurrentSnapshotKeyVersionOutcome =
  | { kind: "current"; keyVersion: number }
  | { kind: "no_key_yet" };

export async function currentSnapshotKeyVersion(
  { store }: CurrentSnapshotKeyVersionPorts,
  { registerId }: CurrentSnapshotKeyVersionInput,
): Promise<CurrentSnapshotKeyVersionOutcome> {
  const keyVersion = latestKeyVersion(
    await store.transaction((tx) => tx.snapshotKeyVersions(registerId)),
  );
  return keyVersion === undefined ? { kind: "no_key_yet" } : { kind: "current", keyVersion };
}
