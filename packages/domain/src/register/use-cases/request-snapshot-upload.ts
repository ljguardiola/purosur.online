import type { Clock } from "../../shared/index.js";
import type { SnapshotStore } from "./snapshot-generations.js";

export interface RequestSnapshotUploadPorts {
  store: SnapshotStore;
  clock: Clock;
}

export interface RequestSnapshotUploadInput {
  registerId: string;
  deviceId: string;
  generationId: string;
  size: number;
  sha256: string;
  keyVersion: number;
}

export interface AuthorizedSnapshotUpload {
  registerId: string;
  generationId: string;
  size: number;
  sha256: string;
  keyVersion: number;
}

export type RequestSnapshotUploadOutcome =
  | { kind: "authorized"; generation: AuthorizedSnapshotUpload }
  | { kind: "unknown_key_version" }
  | { kind: "generation_conflict" }
  | { kind: "generation_settled" };

export async function requestSnapshotUpload(
  { store, clock }: RequestSnapshotUploadPorts,
  input: RequestSnapshotUploadInput,
): Promise<RequestSnapshotUploadOutcome> {
  return store.transaction<RequestSnapshotUploadOutcome>(async (tx) => {
    await tx.lockRegisterSnapshots(input.registerId);
    const keyVersions = await tx.snapshotKeyVersions(input.registerId);
    if (!keyVersions.includes(input.keyVersion)) {
      return { kind: "unknown_key_version" };
    }

    const authorized: RequestSnapshotUploadOutcome = {
      kind: "authorized",
      generation: {
        registerId: input.registerId,
        generationId: input.generationId,
        size: input.size,
        sha256: input.sha256,
        keyVersion: input.keyVersion,
      },
    };
    const existing = await tx.findGeneration(input.generationId);
    if (!existing) {
      await tx.recordDeclaredGeneration({
        id: input.generationId,
        registerId: input.registerId,
        deviceId: input.deviceId,
        createdAt: clock.now(),
        size: input.size,
        sha256: input.sha256,
        keyVersion: input.keyVersion,
      });
      return authorized;
    }

    const sameDeclaration =
      existing.registerId === input.registerId &&
      existing.size === input.size &&
      existing.sha256 === input.sha256 &&
      existing.keyVersion === input.keyVersion;
    if (!sameDeclaration) {
      return { kind: "generation_conflict" };
    }
    if (existing.status === "verified" || existing.status === "failed") {
      return { kind: "generation_settled" };
    }
    return authorized;
  });
}
