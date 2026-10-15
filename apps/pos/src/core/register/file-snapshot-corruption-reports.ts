import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { SNAPSHOT_CORRUPTION_STAGES, type SnapshotCorruptionStage } from "@purosur/domain";
import type { SnapshotCorruptionReports } from "@purosur/domain/register/use-cases";

export const SNAPSHOT_CORRUPTION_UNREPORTED_FILE = "snapshot-corruption-unreported";

function stageOf(text: string): SnapshotCorruptionStage {
  return SNAPSHOT_CORRUPTION_STAGES.find((stage) => stage === text.trim()) ?? "copy";
}

export function fileSnapshotCorruptionReports(path: string): SnapshotCorruptionReports {
  return {
    pending: async () => (existsSync(path) ? stageOf(readFileSync(path, "utf8")) : undefined),
    record: async (stage) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, stage);
    },
    settle: async () => rmSync(path, { force: true }),
  };
}
