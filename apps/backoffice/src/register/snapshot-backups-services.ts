import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { ChangeSnapshotLifecycleRulesModalServices } from "./change-snapshot-lifecycle-rules-modal";
import type { RotateSnapshotKeyModalServices } from "./rotate-snapshot-key-modal";
import {
  changeSnapshotLifecycleRules,
  fetchSnapshotBackups,
  rotateSnapshotKey,
} from "./snapshot-backups-api";

export type SnapshotBackupsSectionServices = {
  fetchSnapshotBackups: typeof fetchSnapshotBackups;
} & ChangeSnapshotLifecycleRulesModalServices &
  RotateSnapshotKeyModalServices;

export const defaultSnapshotBackupsSectionServices: SnapshotBackupsSectionServices = {
  fetchSnapshotBackups,
  changeSnapshotLifecycleRules,
  rotateSnapshotKey,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
