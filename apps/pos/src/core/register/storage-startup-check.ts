import { startupDiskVerdict } from "@purosur/domain";
import type { StorageReading } from "../sync/storage-telemetry";

export async function startupStorageShortOf(deps: {
  read: () => Promise<StorageReading>;
  onFailure: (error: unknown) => void;
}): Promise<{ requiredFreeBytes: number } | null> {
  try {
    const reading = await deps.read();
    const verdict = startupDiskVerdict({
      freeBytes: reading.disk_free_bytes,
      databaseSizeBytes: reading.database_size_bytes,
    });
    return verdict.kind === "short" ? { requiredFreeBytes: verdict.required_free_bytes } : null;
  } catch (error) {
    deps.onFailure(error);
    return null;
  }
}
