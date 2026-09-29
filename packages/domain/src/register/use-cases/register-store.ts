import type { EnrollmentCodeState } from "../model/enrollment-code.js";

export interface Clock {
  now(): Date;
}

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

export interface StoredDeviceToken {
  lookupPrefix: string;
  tokenHash: string;
  issuedAt: Date;
}

export interface LockedInstallation {
  deviceId: string;
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
  revokeActiveInstallation(registerId: string, revokedAt: Date): Promise<{ revoked: boolean }>;
  recordInstallation(installation: NewInstallation): Promise<{ deviceId: string }>;
  lockInstallationByTokenPrefix(lookupPrefix: string): Promise<LockedInstallation | undefined>;
  promotePendingDeviceToken(deviceId: string): Promise<void>;
  recordPendingDeviceToken(deviceId: string, token: StoredDeviceToken): Promise<void>;
  markEnrollmentCodeRedeemed(registerId: string, redeemedAt: Date): Promise<void>;
  openEnrollmentAlert(alert: EnrollmentAlert): Promise<void>;
}
