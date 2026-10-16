import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { ChangeSnapshotLifecycleRulesModalServices } from "./change-snapshot-lifecycle-rules-modal";
import type { RotateSnapshotKeyModalServices } from "./rotate-snapshot-key-modal";
import {
  changeSnapshotLifecycleRules,
  fetchSnapshotBackupRegisters,
  fetchSnapshotBackups,
  rotateSnapshotKey,
} from "./snapshot-backups-api";

export type SnapshotBackupsScreenServices = {
  fetchSnapshotBackupRegisters: typeof fetchSnapshotBackupRegisters;
  fetchSnapshotBackups: typeof fetchSnapshotBackups;
} & ChangeSnapshotLifecycleRulesModalServices &
  RotateSnapshotKeyModalServices;

export const defaultSnapshotBackupsScreenServices: SnapshotBackupsScreenServices = {
  fetchSnapshotBackupRegisters,
  fetchSnapshotBackups,
  changeSnapshotLifecycleRules,
  rotateSnapshotKey,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
