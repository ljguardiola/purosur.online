import type { Clock } from "../../shared/index.js";
import {
  isAwaitingSnapshotVerification,
  snapshotUploadUrlLifetimeSeconds,
} from "../model/snapshot-generation.js";
import { SnapshotGenerationIdTaken, type SnapshotStore } from "./snapshot-generations.js";

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
  issuedAt: Date;
  lifetimeSeconds: number;
}

export type RequestSnapshotUploadOutcome =
  | { kind: "authorized"; generation: AuthorizedSnapshotUpload }
  | { kind: "unknown_key_version" }
  | { kind: "generation_conflict" }
  | { kind: "generation_settled" }
  | { kind: "upload_deadline_passed" };

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

    const existing = await tx.findGeneration(input.registerId, input.generationId);
    if (existing) {
      const sameDeclaration =
        existing.size === input.size &&
        existing.sha256 === input.sha256 &&
        existing.keyVersion === input.keyVersion;
      if (!sameDeclaration) {
        return { kind: "generation_conflict" };
      }
      if (!isAwaitingSnapshotVerification(existing.status)) {
        return { kind: "generation_settled" };
      }
    }

    const now = clock.now();
    const lifetimeSeconds = snapshotUploadUrlLifetimeSeconds(existing?.createdAt ?? now, now);
    if (lifetimeSeconds === undefined) {
      return { kind: "upload_deadline_passed" };
    }
    if (!existing) {
      try {
        await tx.recordDeclaredGeneration({
          id: input.generationId,
          registerId: input.registerId,
          deviceId: input.deviceId,
          createdAt: now,
          size: input.size,
          sha256: input.sha256,
          keyVersion: input.keyVersion,
        });
      } catch (error) {
        if (error instanceof SnapshotGenerationIdTaken) {
          return { kind: "generation_conflict" };
        }
        throw error;
      }
    }
    return {
      kind: "authorized",
      generation: {
        registerId: input.registerId,
        generationId: input.generationId,
        size: input.size,
        sha256: input.sha256,
        keyVersion: input.keyVersion,
        issuedAt: now,
        lifetimeSeconds,
      },
    };
  });
}
