import type { LocalSnapshotGeneration } from "../model/local-snapshot-generation.js";

export interface LocalSnapshotGenerations {
  pendingNewestFirst(): Promise<LocalSnapshotGeneration[]>;
  objectOf(generation: LocalSnapshotGeneration): Promise<Uint8Array<ArrayBuffer> | undefined>;
  markUploaded(generation: LocalSnapshotGeneration, at: Date): Promise<void>;
  markRefused(generation: LocalSnapshotGeneration, at: Date): Promise<void>;
}

export interface SnapshotUploadDestination {
  url: string;
  headers: Record<string, string>;
}

export type SnapshotDeclarationAnswer =
  | { kind: "accepted"; destination: SnapshotUploadDestination }
  | { kind: "refused"; code: string }
  | { kind: "failed" }
  | { kind: "unreachable" };

export type SnapshotCloudStep = "done" | "failed" | "unreachable";

export interface SnapshotUploadCloud {
  declare(generation: LocalSnapshotGeneration): Promise<SnapshotDeclarationAnswer>;
  putObject(
    destination: SnapshotUploadDestination,
    object: Uint8Array<ArrayBuffer>,
  ): Promise<SnapshotCloudStep>;
  confirmUploaded(generation: LocalSnapshotGeneration): Promise<SnapshotCloudStep>;
}
