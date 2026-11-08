import type { DeviceCredentials } from "@purosur/contracts";
import { isHeldSnapshotKeyOutdated, latestKey } from "@purosur/domain";
import type { DeviceTokenRotation } from "./device-token-rotation";

export interface AnnouncedKeyRefreshDeps {
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  refreshInstallationKeysNow: DeviceTokenRotation["refreshInstallationKeysNow"];
}

export async function refreshKeysWhenAnnounced(
  announcedKeyVersion: number | undefined,
  deps: AnnouncedKeyRefreshDeps,
): Promise<void> {
  if (announcedKeyVersion === undefined) {
    return;
  }
  const credentials = await deps.readCredentials();
  if (credentials === undefined) {
    return;
  }
  const heldVersion = latestKey(credentials.keys?.snapshot_key_versions ?? [])?.version;
  if (isHeldSnapshotKeyOutdated(heldVersion, announcedKeyVersion)) {
    await deps.refreshInstallationKeysNow();
  }
}
