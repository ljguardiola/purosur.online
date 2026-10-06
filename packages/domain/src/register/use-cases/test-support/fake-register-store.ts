import type {
  Clock,
  DeviceTokenIssuer,
  DeviceTokenRotator,
  EnrollmentAlert,
  EnrollmentAttemptKey,
  EnrollmentCodeVerifier,
  InstallationEnrollment,
  InstallationKeyGenerator,
  InstallationRevocation,
  IssuedDeviceToken,
  LockedEnrollmentCode,
  LockedInstallation,
  NewInstallation,
  PresentedDeviceToken,
  RegisterKeys,
  RegisterStore,
  RegisterStoreTransaction,
  StoredDeviceToken,
  VersionedKey,
} from "../register-store.js";

export interface FakeEnrollmentCode extends LockedEnrollmentCode {
  lookup: string;
}

export interface FakeInstallation extends Omit<NewInstallation, "outboxChainKey"> {
  deviceId: string;
  outboxChainKey: string | null;
  revokedAt: Date | null;
  pendingToken: StoredDeviceToken | null;
}

export interface FakeEnrollmentAttempt {
  key: EnrollmentAttemptKey;
  attemptedAt: Date;
}

export interface FakeRegisterKey extends VersionedKey {
  registerId: string;
}

export interface FakeRegisterState {
  codes: FakeEnrollmentCode[];
  attempts: FakeEnrollmentAttempt[];
  installations: FakeInstallation[];
  snapshotKeys: FakeRegisterKey[];
  contingencyTicketKeys: FakeRegisterKey[];
  enrollmentAlerts: EnrollmentAlert[];
  installationRevocations: InstallationRevocation[];
  installationEnrollments: InstallationEnrollment[];
  nextId: number;
}

type WriteOperation =
  | "recordEnrollmentAttempt"
  | "recordFailedEnrollmentAttempt"
  | "revokeActiveInstallation"
  | "recordInstallationRevocation"
  | "recordInstallation"
  | "recordInstallationEnrollment"
  | "promotePendingDeviceToken"
  | "recordPendingDeviceToken"
  | "recordOutboxChainKey"
  | "recordSnapshotKey"
  | "recordContingencyTicketKey"
  | "markEnrollmentCodeRedeemed"
  | "openEnrollmentAlert";

function cloneState(state: FakeRegisterState): FakeRegisterState {
  return structuredClone(state);
}

function sameKey(a: EnrollmentAttemptKey, b: EnrollmentAttemptKey): boolean {
  return a.kind === b.kind && a.value === b.value;
}

class FakeRegisterStoreTransaction implements RegisterStoreTransaction {
  private readonly state: FakeRegisterState;
  private readonly store: FakeRegisterStore;

  constructor(state: FakeRegisterState, store: FakeRegisterStore) {
    this.state = state;
    this.store = store;
  }

  async lockEnrollmentCodes(lookup: string): Promise<LockedEnrollmentCode[]> {
    this.store.operationOrder.push("lockEnrollmentCodes");
    return this.state.codes
      .filter((code) => code.lookup === lookup)
      .map(({ lookup: _lookup, ...code }) => structuredClone(code));
  }

  async lockEnrollmentAttempts(keys: readonly EnrollmentAttemptKey[]): Promise<void> {
    this.store.operationOrder.push("lockEnrollmentAttempts");
    this.store.lockedAttemptKeys.push(...keys.map((key) => ({ ...key })));
  }

  async acceptedEnrollmentAttempts(key: EnrollmentAttemptKey, since: Date): Promise<Date[]> {
    this.store.operationOrder.push("acceptedEnrollmentAttempts");
    return this.state.attempts
      .filter((attempt) => sameKey(attempt.key, key) && attempt.attemptedAt > since)
      .map((attempt) => new Date(attempt.attemptedAt));
  }

  async recordEnrollmentAttempt(
    keys: readonly EnrollmentAttemptKey[],
    attemptedAt: Date,
  ): Promise<void> {
    this.beforeWrite("recordEnrollmentAttempt");
    for (const key of keys) {
      this.state.attempts.push({ key: { ...key }, attemptedAt: new Date(attemptedAt) });
    }
  }

  async recordFailedEnrollmentAttempt(registerIds: readonly string[]): Promise<void> {
    this.beforeWrite("recordFailedEnrollmentAttempt");
    for (const code of this.state.codes) {
      if (registerIds.includes(code.registerId)) {
        code.failedAttempts += 1;
      }
    }
  }

  async revokeActiveInstallation(
    registerId: string,
    revokedAt: Date,
  ): Promise<{ revokedDeviceId: string | null }> {
    this.beforeWrite("revokeActiveInstallation");
    let revokedDeviceId: string | null = null;
    for (const installation of this.state.installations) {
      if (installation.registerId === registerId && installation.revokedAt === null) {
        installation.revokedAt = new Date(revokedAt);
        revokedDeviceId = installation.deviceId;
      }
    }
    return { revokedDeviceId };
  }

  async recordInstallationRevocation(revocation: InstallationRevocation): Promise<void> {
    this.beforeWrite("recordInstallationRevocation");
    this.state.installationRevocations.push(structuredClone(revocation));
  }

  async recordInstallation(installation: NewInstallation): Promise<{ deviceId: string }> {
    this.beforeWrite("recordInstallation");
    const deviceId = `device-${this.state.nextId++}`;
    this.state.installations.push({
      ...structuredClone(installation),
      deviceId,
      revokedAt: null,
      pendingToken: null,
    });
    return { deviceId };
  }

  async recordInstallationEnrollment(enrollment: InstallationEnrollment): Promise<void> {
    this.beforeWrite("recordInstallationEnrollment");
    this.state.installationEnrollments.push(structuredClone(enrollment));
  }

  async lockInstallationByTokenPrefix(
    lookupPrefix: string,
  ): Promise<LockedInstallation | undefined> {
    this.store.operationOrder.push("lockInstallationByTokenPrefix");
    const installation = this.state.installations.find(
      (row) =>
        row.tokenLookupPrefix === lookupPrefix || row.pendingToken?.lookupPrefix === lookupPrefix,
    );
    if (!installation) {
      return undefined;
    }
    return {
      deviceId: installation.deviceId,
      registerId: installation.registerId,
      revoked: installation.revokedAt !== null,
      currentToken: {
        lookupPrefix: installation.tokenLookupPrefix,
        tokenHash: installation.tokenHash,
        issuedAt: new Date(installation.tokenIssuedAt),
      },
      pendingToken: installation.pendingToken
        ? structuredClone(installation.pendingToken)
        : undefined,
    };
  }

  async promotePendingDeviceToken(deviceId: string): Promise<void> {
    this.beforeWrite("promotePendingDeviceToken");
    const installation = this.installation(deviceId);
    if (installation.pendingToken) {
      installation.tokenLookupPrefix = installation.pendingToken.lookupPrefix;
      installation.tokenHash = installation.pendingToken.tokenHash;
      installation.tokenIssuedAt = installation.pendingToken.issuedAt;
      installation.pendingToken = null;
    }
  }

  async recordPendingDeviceToken(deviceId: string, token: StoredDeviceToken): Promise<void> {
    this.beforeWrite("recordPendingDeviceToken");
    this.installation(deviceId).pendingToken = structuredClone(token);
  }

  async outboxChainKey(deviceId: string): Promise<string | undefined> {
    this.store.operationOrder.push("outboxChainKey");
    return this.installation(deviceId).outboxChainKey ?? undefined;
  }

  async recordOutboxChainKey(deviceId: string, outboxChainKey: string): Promise<void> {
    this.beforeWrite("recordOutboxChainKey");
    this.installation(deviceId).outboxChainKey = outboxChainKey;
  }

  async lockRegisterKeys(registerId: string): Promise<RegisterKeys> {
    this.store.operationOrder.push("lockRegisterKeys");
    const ofRegister = (keys: FakeRegisterKey[]): VersionedKey[] =>
      keys
        .filter((key) => key.registerId === registerId)
        .map(({ version, key }) => ({ version, key }));
    return {
      snapshotKeys: ofRegister(this.state.snapshotKeys),
      contingencyTicketKeys: ofRegister(this.state.contingencyTicketKeys),
    };
  }

  async recordSnapshotKey(registerId: string, key: VersionedKey): Promise<void> {
    this.beforeWrite("recordSnapshotKey");
    this.state.snapshotKeys.push({ registerId, ...key });
  }

  async recordContingencyTicketKey(registerId: string, key: VersionedKey): Promise<void> {
    this.beforeWrite("recordContingencyTicketKey");
    this.state.contingencyTicketKeys.push({ registerId, ...key });
  }

  async markEnrollmentCodeRedeemed(registerId: string, redeemedAt: Date): Promise<void> {
    this.beforeWrite("markEnrollmentCodeRedeemed");
    for (const code of this.state.codes) {
      if (code.registerId === registerId) {
        code.redeemedAt = new Date(redeemedAt);
      }
    }
  }

  async openEnrollmentAlert(alert: EnrollmentAlert): Promise<void> {
    this.beforeWrite("openEnrollmentAlert");
    this.state.enrollmentAlerts.push(structuredClone(alert));
  }

  private installation(deviceId: string): FakeInstallation {
    const installation = this.state.installations.find((row) => row.deviceId === deviceId);
    if (!installation) {
      throw new Error(`no installation ${deviceId}`);
    }
    return installation;
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeRegisterStore implements RegisterStore {
  private state: FakeRegisterState = {
    codes: [],
    attempts: [],
    installations: [],
    snapshotKeys: [],
    contingencyTicketKeys: [],
    enrollmentAlerts: [],
    installationRevocations: [],
    installationEnrollments: [],
    nextId: 1,
  };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];
  lockedAttemptKeys: EnrollmentAttemptKey[] = [];

  seedCode(code: FakeEnrollmentCode): void {
    this.state.codes.push(structuredClone(code));
  }

  seedAttempt(attempt: FakeEnrollmentAttempt): void {
    this.state.attempts.push(structuredClone(attempt));
  }

  seedInstallation(installation: FakeInstallation): void {
    this.state.installations.push(structuredClone(installation));
  }

  seedSnapshotKey(key: FakeRegisterKey): void {
    this.state.snapshotKeys.push({ ...key });
  }

  seedContingencyTicketKey(key: FakeRegisterKey): void {
    this.state.contingencyTicketKeys.push({ ...key });
  }

  snapshot(): FakeRegisterState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: RegisterStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = cloneState(this.state);
    try {
      return await work(new FakeRegisterStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}

export class FixedClock implements Clock {
  private readonly moment: Date;

  constructor(moment: Date) {
    this.moment = moment;
  }

  now(): Date {
    return new Date(this.moment);
  }
}

export class SequentialDeviceTokens implements DeviceTokenIssuer {
  private issued = 0;

  issue(): IssuedDeviceToken {
    this.issued += 1;
    return {
      deviceToken: `prefix-${this.issued}.secret-${this.issued}`,
      lookupPrefix: `prefix-${this.issued}`,
      tokenHash: `hash-of-token-${this.issued}`,
    };
  }
}

export class SequentialInstallationKeys implements InstallationKeyGenerator {
  private generated = 0;

  generate(): string {
    this.generated += 1;
    return `key-${this.generated}`;
  }
}

export const hashOfCode = (code: string): string => `hash-of-${code}`;

export const plainCodeHashes: EnrollmentCodeVerifier = {
  matches: (code, codeHash) => hashOfCode(code) === codeHash,
};

const hashOfToken = (deviceToken: string): string => `hash-of-${deviceToken}`;

function readToken(deviceToken: string): PresentedDeviceToken | undefined {
  const [lookupPrefix, secret, ...rest] = deviceToken.split(".");
  if (!lookupPrefix || !secret || rest.length > 0) {
    return undefined;
  }
  return { lookupPrefix, tokenHash: hashOfToken(deviceToken) };
}

export function storedTokenOf(deviceToken: string, issuedAt: Date): StoredDeviceToken {
  const presented = readToken(deviceToken);
  if (!presented) {
    throw new Error(`malformed token ${deviceToken}`);
  }
  return { ...presented, issuedAt };
}

export const derivedDeviceTokens: DeviceTokenRotator = {
  read: readToken,
  successorOf(deviceToken) {
    const presented = readToken(deviceToken);
    if (!presented) {
      throw new Error(`malformed token ${deviceToken}`);
    }
    const secret = deviceToken.slice(presented.lookupPrefix.length + 1);
    const successor = `next-of-${presented.lookupPrefix}.${secret}`;
    return {
      deviceToken: successor,
      lookupPrefix: `next-of-${presented.lookupPrefix}`,
      tokenHash: hashOfToken(successor),
    };
  },
};
