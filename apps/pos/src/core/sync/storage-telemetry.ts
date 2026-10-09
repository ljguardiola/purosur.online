import { stat, statfs } from "node:fs/promises";
import type { StorageTelemetry } from "@purosur/domain";

export interface StorageFileSystem {
  sizeOf(path: string): Promise<number | undefined>;
  capacityOf(path: string): Promise<{ availableBytes: number; totalBytes: number }>;
}

export const nodeStorageFileSystem: StorageFileSystem = {
  sizeOf: async (path) => {
    try {
      return (await stat(path)).size;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  },
  capacityOf: async (path) => {
    const volume = await statfs(path);
    return {
      availableBytes: Number(volume.bavail) * Number(volume.bsize),
      totalBytes: Number(volume.blocks) * Number(volume.bsize),
    };
  },
};

export function storageTelemetryReader(
  databasePath: string,
  fileSystem: StorageFileSystem,
): () => Promise<StorageTelemetry> {
  return async () => {
    const walSizeBytes = await fileSystem.sizeOf(`${databasePath}-wal`);
    const { availableBytes, totalBytes } = await fileSystem.capacityOf(databasePath);
    return {
      wal_size_bytes: walSizeBytes ?? 0,
      disk_free_bytes: availableBytes,
      disk_free_ratio: totalBytes === 0 ? 0 : Math.min(1, availableBytes / totalBytes),
    };
  };
}
