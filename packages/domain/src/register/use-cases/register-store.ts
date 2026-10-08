import type { Clock } from "../../shared/index.js";
import type { EnrollmentCodeState } from "../model/enrollment-code.js";
import type { VersionedKey } from "../model/installation-key.js";

export type { VersionedKey };

export interface IssuedDeviceToken {
  deviceToken: string;
  lookupPrefix: string;
  tokenHash: string;
}

export interface DeviceTokenIssuer {
  issue(): IssuedDeviceToken;
}

export interface PresentedDeviceToken {
  lookupPrefix: string;
  tokenHash: string;
}

export interface DeviceTokenRotator {
  read(deviceToken: string): PresentedDeviceToken | undefined;
  successorOf(deviceToken: string): IssuedDeviceToken;
}

export interface InstallationTokenPorts {
  store: RegisterStore;
  clock: Clock;
  tokens: DeviceTokenRotator;
}

export interface InstallationKeyGenerator {
  generate(): string;
}

export interface DeviceTokenRotationPorts extends InstallationTokenPorts {
  keys: InstallationKeyGenerator;
}

export interface StoredDeviceToken {
  lookupPrefix: string;
  tokenHash: string;
  issuedAt: Date;
}

export interface LockedInstallation {
  deviceId: string;
  registerId: string;
  revoked: boolean;
  currentToken: StoredDeviceToken;
  pendingToken: StoredDeviceToken | undefined;
}

export interface EnrollmentCodeVerifier {
  matches(code: string, codeHash: string): boolean;
}

export interface EnrollmentPorts {
  store: RegisterStore;
  clock: Clock;
  tokens: DeviceTokenIssuer;
  codes: EnrollmentCodeVerifier;
  keys: InstallationKeyGenerator;
}

export interface LockedEnrollmentCode extends EnrollmentCodeState {
  registerId: string;
  codeHash: string;
}

export type EnrollmentAttemptKey =
  | { kind: "source_address"; value: string }
  | { kind: "register"; value: string };

export interface NewInstallation {
  registerId: string;
  tokenLookupPrefix: string;
  tokenHash: string;
  tokenIssuedAt: Date;
  outboxChainKey: string;
  hostname: string;
  windowsVersion: string;
  enrolledAt: Date;
}

export interface EnrollmentAlert {
  registerId: string;
  deviceId: string;
  hostname: string;
  windowsVersion: string;
  replacedInstallation: boolean;
  enrolledAt: Date;
}

export interface InstallationRevocation {
  registerId: string;
  deviceId: string;
  revokedAt: Date;
}

export interface InstallationEnrollment {
  registerId: string;
  deviceId: string;
  hostname: string;
  windowsVersion: string;
  replacedDeviceId: string | null;
  enrolledAt: Date;
}

export interface RegisterKeys {
  snapshotKeys: VersionedKey[];
  contingencyTicketKeys: VersionedKey[];
}

export interface RegisterStore {
  transaction<TOutcome>(
    work: (tx: RegisterStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RegisterStoreTransaction {
  lockEnrollmentCodes(lookup: string): Promise<LockedEnrollmentCode[]>;
  lockEnrollmentAttempts(keys: readonly EnrollmentAttemptKey[]): Promise<void>;
  acceptedEnrollmentAttempts(key: EnrollmentAttemptKey, since: Date): Promise<Date[]>;
  recordEnrollmentAttempt(keys: readonly EnrollmentAttemptKey[], attemptedAt: Date): Promise<void>;
  recordFailedEnrollmentAttempt(registerIds: readonly string[]): Promise<void>;
  revokeActiveInstallation(
    registerId: string,
    revokedAt: Date,
  ): Promise<{ revokedDeviceId: string | null }>;
  recordInstallationRevocation(revocation: InstallationRevocation): Promise<void>;
  recordInstallation(installation: NewInstallation): Promise<{ deviceId: string }>;
  recordInstallationEnrollment(enrollment: InstallationEnrollment): Promise<void>;
  lockInstallationByTokenPrefix(lookupPrefix: string): Promise<LockedInstallation | undefined>;
  promotePendingDeviceToken(deviceId: string): Promise<void>;
  recordPendingDeviceToken(deviceId: string, token: StoredDeviceToken): Promise<void>;
  outboxChainKey(deviceId: string): Promise<string | undefined>;
  recordOutboxChainKey(deviceId: string, outboxChainKey: string): Promise<void>;
  lockRegisterKeys(registerId: string): Promise<RegisterKeys>;
  recordSnapshotKey(registerId: string, key: VersionedKey): Promise<void>;
  recordContingencyTicketKey(registerId: string, key: VersionedKey): Promise<void>;
  markEnrollmentCodeRedeemed(registerId: string, redeemedAt: Date): Promise<void>;
  openEnrollmentAlert(alert: EnrollmentAlert): Promise<void>;
}
