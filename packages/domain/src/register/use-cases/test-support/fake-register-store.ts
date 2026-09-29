import type {
  Clock,
  DeviceTokenIssuer,
  EnrollmentAlert,
  EnrollmentAttemptKey,
  EnrollmentCodeVerifier,
  IssuedDeviceToken,
  LockedEnrollmentCode,
  NewInstallation,
  RegisterStore,
  RegisterStoreTransaction,
} from "../register-store.js";

export interface FakeEnrollmentCode extends LockedEnrollmentCode {
  lookup: string;
}

export interface FakeInstallation extends NewInstallation {
  deviceId: string;
  revokedAt: Date | null;
}

export interface FakeEnrollmentAttempt {
  key: EnrollmentAttemptKey;
  attemptedAt: Date;
}

export interface FakeRegisterState {
  codes: FakeEnrollmentCode[];
  attempts: FakeEnrollmentAttempt[];
  installations: FakeInstallation[];
  enrollmentAlerts: EnrollmentAlert[];
  nextId: number;
}

type WriteOperation =
  | "recordEnrollmentAttempt"
  | "recordFailedEnrollmentAttempt"
  | "revokeActiveInstallation"
  | "recordInstallation"
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
  ): Promise<{ revoked: boolean }> {
    this.beforeWrite("revokeActiveInstallation");
    let revoked = false;
    for (const installation of this.state.installations) {
      if (installation.registerId === registerId && installation.revokedAt === null) {
        installation.revokedAt = new Date(revokedAt);
        revoked = true;
      }
    }
    return { revoked };
  }

  async recordInstallation(installation: NewInstallation): Promise<{ deviceId: string }> {
    this.beforeWrite("recordInstallation");
    const deviceId = `device-${this.state.nextId++}`;
    this.state.installations.push({ ...structuredClone(installation), deviceId, revokedAt: null });
    return { deviceId };
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
    enrollmentAlerts: [],
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

export const hashOfCode = (code: string): string => `hash-of-${code}`;

export const plainCodeHashes: EnrollmentCodeVerifier = {
  matches: (code, codeHash) => hashOfCode(code) === codeHash,
};
