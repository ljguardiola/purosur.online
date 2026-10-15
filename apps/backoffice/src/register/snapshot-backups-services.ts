import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { RotateSnapshotKeyModalServices } from "./rotate-snapshot-key-modal";
import {
  changeSnapshotLifecycleRules,
  fetchSnapshotBackupRegisters,
  fetchSnapshotBackups,
  rotateSnapshotKey,
} from "./snapshot-backups-api";
import type { SnapshotLifecycleRulesModalServices } from "./snapshot-lifecycle-rules-modal";

export type SnapshotBackupsScreenServices = {
  fetchSnapshotBackupRegisters: typeof fetchSnapshotBackupRegisters;
  fetchSnapshotBackups: typeof fetchSnapshotBackups;
} & SnapshotLifecycleRulesModalServices &
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
