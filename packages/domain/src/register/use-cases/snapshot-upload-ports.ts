import type { LocalSnapshotGeneration } from "../model/local-snapshot-generation.js";

export interface LocalSnapshotGenerations {
  pendingNewestFirst(): Promise<LocalSnapshotGeneration[]>;
  objectOf(generation: LocalSnapshotGeneration): Promise<Uint8Array<ArrayBuffer> | undefined>;
  markUploaded(generation: LocalSnapshotGeneration, at: Date): Promise<void>;
  markRefused(generation: LocalSnapshotGeneration, at: Date): Promise<void>;
}

export type SnapshotDeclarationAnswer<Authorization> =
  | { kind: "accepted"; authorization: Authorization; currentKeyVersion: number }
  | { kind: "refused"; code: string }
  | { kind: "failed" }
  | { kind: "unreachable" };

export type SnapshotCloudStep = "done" | "failed" | "unreachable";

export interface SnapshotUploadCloud<Authorization> {
  declare(generation: LocalSnapshotGeneration): Promise<SnapshotDeclarationAnswer<Authorization>>;
  putObject(
    authorization: Authorization,
    object: Uint8Array<ArrayBuffer>,
  ): Promise<SnapshotCloudStep>;
  confirmUploaded(generation: LocalSnapshotGeneration): Promise<SnapshotCloudStep>;
}
