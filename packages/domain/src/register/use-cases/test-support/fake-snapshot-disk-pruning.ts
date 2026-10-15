import type { LocalSnapshotGeneration } from "../../model/local-snapshot-generation.js";
import type { SnapshotDiskSpace } from "../../model/snapshot-disk-pruning.js";
import type {
  SnapshotGenerationsOnDisk,
  SnapshotVerificationAnswer,
  SnapshotVerificationCloud,
} from "../snapshot-disk-pruning-ports.js";

export class FakeSnapshotGenerationsOnDisk implements SnapshotGenerationsOnDisk {
  held: LocalSnapshotGeneration[] = [];
  free: SnapshotDiskSpace = { diskFreeBytes: 100 * 1024 ** 3, diskFreeRatio: 0.5 };

  hold(...generations: LocalSnapshotGeneration[]): void {
    this.held.push(...generations);
  }

  async space(): Promise<SnapshotDiskSpace> {
    return this.free;
  }

  async generations(): Promise<LocalSnapshotGeneration[]> {
    return [...this.held];
  }

  async remove(generation: LocalSnapshotGeneration): Promise<void> {
    this.held = this.held.filter((entry) => entry.generationId !== generation.generationId);
  }
}

export class FakeSnapshotVerificationCloud implements SnapshotVerificationCloud {
  verified = new Set<string>();
  reachable = true;
  readonly asked: string[][] = [];

  async verifiedAmong(generationIds: readonly string[]): Promise<SnapshotVerificationAnswer> {
    this.asked.push([...generationIds]);
    if (!this.reachable) {
      return { kind: "unanswered" };
    }
    return { kind: "answered", verifiedGenerationIds: [...this.verified] };
  }
}
