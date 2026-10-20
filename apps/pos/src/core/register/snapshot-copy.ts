import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { SnapshotCorruptionStage } from "@purosur/domain";
import { openReadOnlyLocalDatabaseFile } from "../platform/local-database";
import { type Durability, nodeDurability } from "./durable-files";

export class SnapshotCopyFailed extends Error {
  readonly stage: SnapshotCorruptionStage;

  constructor(stage: SnapshotCorruptionStage, cause: unknown) {
    super(`the snapshot copy failed at ${stage}`, { cause });
    this.stage = stage;
  }
}

function copyOf(databasePath: string, copyPath: string): void {
  const live = openReadOnlyLocalDatabaseFile(databasePath);
  try {
    live.prepare("VACUUM INTO ?").run(copyPath);
  } finally {
    live.close();
  }
}

export function checkCopy(copyPath: string): void {
  const copy = openReadOnlyLocalDatabaseFile(copyPath);
  try {
    const integrity = copy.pragma("integrity_check") as { integrity_check: string }[];
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
      throw new SnapshotCopyFailed("integrity_check", integrity);
    }
    const violations = copy.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new SnapshotCopyFailed("foreign_key_check", violations);
    }
  } finally {
    copy.close();
  }
}

function inStage<T>(stage: SnapshotCorruptionStage, run: () => T): T {
  try {
    return run();
  } catch (error) {
    throw error instanceof SnapshotCopyFailed ? error : new SnapshotCopyFailed(stage, error);
  }
}

export async function copyAndCheck({
  databasePath,
  copyPath,
  durability = nodeDurability,
}: {
  databasePath: string;
  copyPath: string;
  durability?: Durability;
}): Promise<void> {
  try {
    inStage("copy", () => copyOf(databasePath, copyPath));
    try {
      await durability.file(copyPath);
      await durability.folder(dirname(copyPath));
    } catch (error) {
      throw new SnapshotCopyFailed("copy", error);
    }
    inStage("integrity_check", () => checkCopy(copyPath));
  } catch (error) {
    await rm(copyPath, { force: true });
    throw error;
  }
}
