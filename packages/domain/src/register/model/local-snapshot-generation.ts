import type { SnapshotSequences } from "./snapshot-cycle.js";

export interface LocalSnapshotGeneration {
  generationId: string;
  createdAt: Date;
  sequences: SnapshotSequences;
  keyVersion: number;
  size: number;
  sha256: string;
  uploadedAt: Date | null;
  refusedAt: Date | null;
}

const SETTLING_SNAPSHOT_REFUSALS: readonly string[] = ["conflict", "validation_failed"];

export function isPendingSnapshotGeneration(generation: LocalSnapshotGeneration): boolean {
  return generation.uploadedAt === null && generation.refusedAt === null;
}

function newestFirst(a: LocalSnapshotGeneration, b: LocalSnapshotGeneration): number {
  return (
    b.createdAt.getTime() - a.createdAt.getTime() || b.generationId.localeCompare(a.generationId)
  );
}

export function pendingSnapshotGenerationsNewestFirst(
  generations: readonly LocalSnapshotGeneration[],
): LocalSnapshotGeneration[] {
  return generations.filter(isPendingSnapshotGeneration).sort(newestFirst);
}

export function lastSnapshotGenerationSequences(
  generations: readonly LocalSnapshotGeneration[],
): SnapshotSequences | undefined {
  return [...generations].sort(newestFirst)[0]?.sequences;
}

export function isSettlingSnapshotRefusal(code: string): boolean {
  return SETTLING_SNAPSHOT_REFUSALS.includes(code);
}
