export type { BatteryReading, BatteryReport } from "./model/battery.js";
export {
  BATTERY_READ_INTERVAL_MS,
  batteryHealthPercent,
  batteryReportOf,
  nextOnBatterySince,
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
  isWellFormedInstallationKey,
} from "./model/installation-key.js";
export {
  INSTALLATION_REPORT_MAX_LENGTH,
  isInstallationReportTooLong,
} from "./model/installation-report.js";
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
export {
  isSafeMomentToUpdate,
  REGISTER_UPDATE_HOLD_LIMIT_MS,
} from "./model/update-safe-moment.js";
export type {
  SnapshotCorruptionStage,
  SnapshotFailureReason,
  SnapshotGenerationStatus,
} from "./model/snapshot-generation.js";
export {
  isPastSnapshotUploadDeadline,
  SNAPSHOT_CORRUPTION_STAGES,
  SNAPSHOT_FAILURE_REASONS,
  SNAPSHOT_GENERATION_STATUSES,
  SNAPSHOT_UPLOAD_DEADLINE_MS,
} from "./model/snapshot-generation.js";
export type { SnapshotLifecycleRules } from "./model/snapshot-lifecycle-rules.js";
export {
  DEFAULT_SNAPSHOT_LIFECYCLE_RULES,
  isValidSnapshotLifecycleRules,
  SNAPSHOT_LIFECYCLE_LIMITS,
  SNAPSHOT_RECENT_GENERATIONS,
} from "./model/snapshot-lifecycle-rules.js";
export type { RetainableSnapshotGeneration } from "./model/snapshot-retention.js";
export { snapshotGenerationsToPrune } from "./model/snapshot-retention.js";
