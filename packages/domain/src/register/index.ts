export type { BatteryReading, BatteryReport, BatteryStanding } from "./model/battery.js";
export {
  BATTERY_READ_INTERVAL_MS,
  batteryHealthPercent,
  batteryReportOf,
  batteryReportStanding,
  CRITICAL_BATTERY_PERCENT,
  CRITICAL_BATTERY_PUSH_LIMIT_MS,
  CRITICAL_BATTERY_SALE_RECHECK_MS,
  isOnBatteryTooLong,
  nextOnBatterySince,
  ON_BATTERY_CONDITION_MINUTES,
} from "./model/battery.js";
export { cashCountDifference } from "./model/cash-count.js";
export type { CashMovementDirection } from "./model/cash-movement-direction.js";
export {
  CASH_MOVEMENT_DIRECTIONS,
  cashMovementDirection,
} from "./model/cash-movement-direction.js";
export type { CashMovementKind } from "./model/cash-movement-kind.js";
export {
  CASH_MOVEMENT_KINDS,
  CASH_MOVEMENT_REASON_MAX_LENGTH,
  cashMovementPermission,
  cashMovementReason,
  isValidCashMovementAmount,
} from "./model/cash-movement-kind.js";
export type {
  CashMovement,
  CashMovementType,
  CashSession,
  CashSessionState,
  ClosedCashSession,
  OpenedCashSession,
} from "./model/cash-session.js";
export { CASH_MOVEMENT_TYPES } from "./model/cash-session.js";
export type {
  CashMovementRecordedFact,
  CashSessionClosedFact,
  CashSessionOpenedFact,
} from "./model/cash-session-facts.js";
export type { ClockDriftReport } from "./model/clock-drift.js";
export {
  clockDriftReportOf,
  clockOffsetMs,
  isClockDrifted,
} from "./model/clock-drift.js";
export type { CriticalBatteryAction } from "./model/critical-battery-action.js";
export {
  CRITICAL_BATTERY_ACTIONS,
  criticalBatteryActionShowsCondition,
} from "./model/critical-battery-action.js";
export { isDeviceTokenRotationDue } from "./model/device-token.js";
export { enrollmentAttemptWindowStart } from "./model/enrollment-attempt-limit.js";
export {
  ENROLLMENT_CODE_LENGTH,
  isWellFormedEnrollmentCode,
  normalizeEnrollmentCode,
} from "./model/enrollment-code.js";
export type { CashBreakdown, CashBreakdownLine } from "./model/expected-cash.js";
export { cashBreakdown, expectedCash } from "./model/expected-cash.js";
export {
  hasDistinctKeyVersions,
  INSTALLATION_KEY_BYTES,
  isHeldSnapshotKeyOutdated,
  isWellFormedInstallationKey,
  latestKey,
  latestKeyVersion,
} from "./model/installation-key.js";
export {
  INSTALLATION_REPORT_MAX_LENGTH,
  isInstallationReportTooLong,
} from "./model/installation-report.js";
export type { LocalSnapshotGeneration } from "./model/local-snapshot-generation.js";
export {
  isPendingSnapshotGeneration,
  lastSnapshotGenerationSequences,
  pendingSnapshotGenerationsNewestFirst,
} from "./model/local-snapshot-generation.js";
export { nextOperationNumber } from "./model/operation-number.js";
export type { ReceiptPrinterAddress } from "./model/receipt-printer-address.js";
export { isLockedToAnother } from "./model/register-lock.js";
export {
  isRegisterNameTooLong,
  REGISTER_NAME_MAX_LENGTH,
  registerNameLength,
} from "./model/register-name.js";
export type {
  RegisterAbility,
  RegisterActor,
  RegisterOperation,
  RegisterOperationAccess,
} from "./model/register-operation.js";
export {
  mayAuthorize,
  REGISTER_ABILITIES,
  registerAbilities,
  registerOperationAccess,
} from "./model/register-operation.js";
export type { RegisterService, WatchedRegister } from "./model/register-service.js";
export { isOutOfService, isWatchedForQuietness } from "./model/register-service.js";
export { lastSuccessfulSyncOfRegister } from "./model/register-sync.js";
export type { RegisterVersion } from "./model/register-version.js";
export { isNewerRegisterVersion } from "./model/register-version.js";
export type {
  DetectedSerialDevice,
  RegisteredSerialDevices,
  SerialDeviceIdentity,
  SerialDeviceReport,
  SerialDeviceRole,
  SerialDeviceStanding,
  SerialDevicesReport,
} from "./model/serial-devices.js";
export {
  isSerialDeviceMissing,
  offersSerialDevicesSetup,
  SERIAL_DEVICE_REPORT_STANDINGS,
  SERIAL_DEVICE_ROLES,
  serialDeviceStandings,
} from "./model/serial-devices.js";
export type {
  SnapshotCycleFacts,
  SnapshotSequences,
  SnapshotSkipReason,
} from "./model/snapshot-cycle.js";
export { snapshotIntervalMs } from "./model/snapshot-cycle.js";
export type { SnapshotCorruptionStage } from "./model/snapshot-generation.js";
export {
  isRetainedSnapshotGeneration,
  SNAPSHOT_CORRUPTION_STAGES,
  SNAPSHOT_DOWNLOAD_URL_LIFETIME_MS,
  SNAPSHOT_FAILURE_REASONS,
  SNAPSHOT_GENERATION_STATUSES,
  SNAPSHOT_RETENTION_INTERVAL_MS,
  SNAPSHOT_STATUSES_AWAITING_VERIFICATION,
  SNAPSHOT_VERIFICATION_INTERVAL_MS,
  SNAPSHOT_WORKER_TIME_LIMIT_MS,
} from "./model/snapshot-generation.js";
export type { SnapshotLifecycleRules } from "./model/snapshot-lifecycle-rules.js";
export { SNAPSHOT_LIFECYCLE_LIMITS } from "./model/snapshot-lifecycle-rules.js";
export type { SnapshotLocation } from "./model/snapshot-location.js";
export { SNAPSHOT_LOCATIONS } from "./model/snapshot-location.js";
export type { DiskStanding, StorageSalesStop, StorageStanding } from "./model/storage.js";
export {
  diskStanding,
  STORAGE_READ_INTERVAL_MS,
  startupDiskVerdict,
  storageSalesStopOf,
  walOversized,
} from "./model/storage.js";
export {
  isSafeMomentToUpdate,
  REGISTER_UPDATE_HOLD_LIMIT_MS,
} from "./model/update-safe-moment.js";
