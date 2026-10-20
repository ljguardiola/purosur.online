import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MARKER_FILE = "restore-pending";

export interface RestorePending {
  isPending(): boolean;
  deviceId(): string | undefined;
  begin(deviceId: string): void;
  clear(): void;
}

export function restorePendingIn(folder: string | undefined): RestorePending {
  const marker = folder === undefined ? undefined : join(folder, MARKER_FILE);
  return {
    isPending: () => marker !== undefined && existsSync(marker),
    deviceId() {
      if (marker === undefined || !existsSync(marker)) {
        return undefined;
      }
      try {
        const content: unknown = JSON.parse(readFileSync(marker, "utf8"));
        const deviceId = (content as { device_id?: unknown } | null)?.device_id;
        return typeof deviceId === "string" && deviceId !== "" ? deviceId : undefined;
      } catch {
        return undefined;
      }
    },
    begin(deviceId) {
      if (folder === undefined || marker === undefined) {
        return;
      }
      mkdirSync(folder, { recursive: true });
      const pendingWrite = `${marker}.tmp`;
      writeFileSync(pendingWrite, JSON.stringify({ device_id: deviceId }));
      renameSync(pendingWrite, marker);
    },
    clear() {
      if (marker !== undefined) {
        rmSync(marker, { force: true });
      }
    },
  };
}
