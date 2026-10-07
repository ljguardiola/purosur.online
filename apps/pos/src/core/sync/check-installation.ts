import type { DeviceCredentials } from "@purosur/contracts";
import {
  type CheckInstallationOutcome,
  checkInstallationWithCloud,
  type LocalInstallation,
} from "@purosur/domain/sync/use-cases";
import { type CloudFailure, retryAfterMsOf } from "./cloud-failure";
import { CloudInstallationCheck } from "./cloud-installation-check";
import type { GetFromCloud } from "./cloud-pull-feed";
import type { SyncResult } from "./sync-schedule";

export interface CheckInstallationDeps {
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  installation: LocalInstallation | undefined;
  adoptDevice: (device: { deviceId: string; pepper: string }) => void;
  getFromCloud: GetFromCloud | undefined;
}

export type InstallationCheckAttempt =
  | { kind: "not_enrolled" }
  | { kind: "no_cloud" }
  | { kind: "no_local_database" }
  | CheckInstallationOutcome<CloudFailure>;

export async function checkInstallation(
  deps: CheckInstallationDeps,
): Promise<InstallationCheckAttempt> {
  if (deps.getFromCloud === undefined) {
    return { kind: "no_cloud" };
  }
  if (deps.installation === undefined) {
    return { kind: "no_local_database" };
  }
  const credentials = await deps.readCredentials();
  if (credentials === undefined) {
    return { kind: "not_enrolled" };
  }
  deps.adoptDevice({ deviceId: credentials.device_id, pepper: credentials.pepper });
  return checkInstallationWithCloud({
    installation: deps.installation,
    cloud: new CloudInstallationCheck(deps.getFromCloud, credentials.device_token),
  });
}

export function installationCheckResultOf(attempt: InstallationCheckAttempt): SyncResult {
  if (attempt.kind !== "failed") {
    return { kind: "succeeded" };
  }
  const retryAfterMs = retryAfterMsOf(attempt.failure);
  return retryAfterMs === undefined ? { kind: "failed" } : { kind: "failed", retryAfterMs };
}

export function installationCheckWarningOf(attempt: InstallationCheckAttempt): string | undefined {
  if (attempt.kind === "revoked") {
    return "core: the cloud says this installation was revoked, so this register stopped opening new sales";
  }
  if (attempt.kind === "failed" && attempt.failure.kind !== "unreachable") {
    return "core: the installation check was refused or unreadable, so it will be asked again later";
  }
  return undefined;
}
