import type { Clock } from "../../shared/index.js";
import {
  isAwaitingSnapshotVerification,
  snapshotUploadUrlExpiry,
} from "../model/snapshot-generation.js";
import {
  type AuthorizedSnapshotUpload,
  SnapshotGenerationIdTaken,
  type SnapshotStore,
  type SnapshotUploadAuthorization,
  type SnapshotUploads,
  SnapshotUploadWindowClosed,
} from "./snapshot-generations.js";

export interface RequestSnapshotUploadPorts {
  store: SnapshotStore;
  uploads: SnapshotUploads;
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

type RequestSnapshotUploadRefusal =
  | { kind: "unknown_key_version" }
  | { kind: "generation_conflict" }
  | { kind: "generation_settled" }
  | { kind: "upload_deadline_passed" };

export type RequestSnapshotUploadOutcome =
  | { kind: "authorized"; authorization: SnapshotUploadAuthorization }
  | RequestSnapshotUploadRefusal;

export async function requestSnapshotUpload(
  { store, uploads, clock }: RequestSnapshotUploadPorts,
  input: RequestSnapshotUploadInput,
): Promise<RequestSnapshotUploadOutcome> {
  const declared = await store.transaction<
    { kind: "declared"; upload: AuthorizedSnapshotUpload } | RequestSnapshotUploadRefusal
  >(async (tx) => {
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
    const expiresAt = snapshotUploadUrlExpiry(existing?.createdAt ?? now, now);
    if (expiresAt === undefined) {
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
      kind: "declared",
      upload: {
        registerId: input.registerId,
        generationId: input.generationId,
        keyVersion: input.keyVersion,
        issuedAt: now,
        expiresAt,
      },
    };
  });
  if (declared.kind !== "declared") {
    return declared;
  }

  try {
    return { kind: "authorized", authorization: await uploads.authorizeUpload(declared.upload) };
  } catch (error) {
    if (error instanceof SnapshotUploadWindowClosed) {
      return { kind: "upload_deadline_passed" };
    }
    throw error;
  }
}
