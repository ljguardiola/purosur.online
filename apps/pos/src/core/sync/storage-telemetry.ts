import { stat, statfs } from "node:fs/promises";
import { dirname } from "node:path";
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

export interface StorageReading extends StorageTelemetry {
  database_size_bytes: number;
}

export function storageReadingReader(
  databasePath: string,
  fileSystem: StorageFileSystem,
): () => Promise<StorageReading> {
  return async () => {
    const databaseSizeBytes = await fileSystem.sizeOf(databasePath);
    const walSizeBytes = await fileSystem.sizeOf(`${databasePath}-wal`);
    const { availableBytes, totalBytes } = await fileSystem.capacityOf(dirname(databasePath));
    return {
      database_size_bytes: databaseSizeBytes ?? 0,
      wal_size_bytes: walSizeBytes ?? 0,
      disk_free_bytes: availableBytes,
      disk_free_ratio: totalBytes === 0 ? 0 : Math.min(1, availableBytes / totalBytes),
    };
  };
}

export function storageTelemetryReader(
  databasePath: string,
  fileSystem: StorageFileSystem,
): () => Promise<StorageTelemetry> {
  const read = storageReadingReader(databasePath, fileSystem);
  return async () => {
    const { wal_size_bytes, disk_free_bytes, disk_free_ratio } = await read();
    return { wal_size_bytes, disk_free_bytes, disk_free_ratio };
  };
}
