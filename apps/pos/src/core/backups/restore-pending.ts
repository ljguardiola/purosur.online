import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MARKER_FILE = "restore-pending";

export interface BeginRestoreOptions {
  setAsideLiveDatabase?: boolean;
}

export interface RestorePending {
  isPending(): boolean;
  deviceId(): string | undefined;
  setsAsideLiveDatabase(): boolean;
  begin(deviceId: string, options?: BeginRestoreOptions): void;
  settleSetAside(): void;
  clear(): void;
}

export function restorePendingIn(folder: string | undefined): RestorePending {
  const marker = folder === undefined ? undefined : join(folder, MARKER_FILE);

  function read(): { device_id?: unknown; set_aside_live_database?: unknown } | undefined {
    if (marker === undefined || !existsSync(marker)) {
      return undefined;
    }
    try {
      const content: unknown = JSON.parse(readFileSync(marker, "utf8"));
      return content === null || typeof content !== "object" ? undefined : content;
    } catch {
      return undefined;
    }
  }

  function write(deviceId: string, setAsideLiveDatabase: boolean): void {
    if (folder === undefined || marker === undefined) {
      return;
    }
    mkdirSync(folder, { recursive: true });
    const pendingWrite = `${marker}.tmp`;
    writeFileSync(
      pendingWrite,
      JSON.stringify(
        setAsideLiveDatabase
          ? { device_id: deviceId, set_aside_live_database: true }
          : { device_id: deviceId },
      ),
    );
    renameSync(pendingWrite, marker);
  }

  return {
    isPending: () => marker !== undefined && existsSync(marker),
    deviceId() {
      const deviceId = read()?.device_id;
      return typeof deviceId === "string" && deviceId !== "" ? deviceId : undefined;
    },
    setsAsideLiveDatabase: () => read()?.set_aside_live_database === true,
    begin(deviceId, options) {
      write(deviceId, options?.setAsideLiveDatabase === true);
    },
    settleSetAside() {
      const deviceId = this.deviceId();
      if (deviceId !== undefined) {
        write(deviceId, false);
      }
    },
    clear() {
      if (marker !== undefined) {
        rmSync(marker, { force: true });
      }
    },
  };
}
