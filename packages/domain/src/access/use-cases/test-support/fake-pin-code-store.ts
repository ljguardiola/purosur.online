import type {
  FirstPinCodeEmission,
  FirstPinCodeStore,
  FirstPinCodeStoreTransaction,
  FirstPinCodeTarget,
  QueuedFirstPinCodeEmail,
} from "../first-pin-code-store.js";
import type {
  HashedPin,
  LockedPinCode,
  PinCodeHolder,
  PinCodeRedemption,
  PinCodeRedemptionAttemptKey,
  PinCodeRedemptionStore,
  PinCodeRedemptionStoreTransaction,
  PinHasher,
} from "../pin-code-redemption-store.js";
import type {
  Clock,
  GeneratedPinCode,
  NewPinCode,
  PinCodeEmission,
  PinCodeGenerator,
  PinCodeStore,
  PinCodeStoreTransaction,
  PinCodeTarget,
} from "../pin-code-store.js";

export interface FakePinCode extends NewPinCode {
  failedAttempts: number;
  redeemedAt: Date | null;
  supersededAt: Date | null;
}

export interface FakeRedemptionAttempt {
  key: PinCodeRedemptionAttemptKey;
  attemptedAt: Date;
}

export interface FakePinCodeState {
  users: Map<string, PinCodeTarget>;
  pins: Map<string, HashedPin>;
  codes: FakePinCode[];
  emissions: PinCodeEmission[];
  firstEmissions: FirstPinCodeEmission[];
  queuedEmails: QueuedFirstPinCodeEmail[];
  emails: Map<string, string>;
  registerAccess: Map<string, string[]>;
  attempts: FakeRedemptionAttempt[];
  redemptions: PinCodeRedemption[];
  pinChanges: { userId: string; changedAt: Date }[];
}

type WriteOperation =
  | "supersedeLivePinCodes"
  | "removePin"
  | "recordPinCode"
  | "recordPinCodeEmission"
  | "recordFirstPinCodeEmission"
  | "queueFirstPinCodeEmail"
  | "recordPinCodeRedemptionAttempt"
  | "recordFailedPinCodeRedemption"
  | "replacePin"
  | "markPinCodeRedeemed"
  | "recordPinCodeRedemption";

function cloneState(state: FakePinCodeState): FakePinCodeState {
  return structuredClone(state);
}

class FakePinCodeStoreTransaction
  implements
    PinCodeStoreTransaction,
    PinCodeRedemptionStoreTransaction,
    FirstPinCodeStoreTransaction
{
  private readonly state: FakePinCodeState;
  private readonly store: FakePinCodeStore;

  constructor(state: FakePinCodeState, store: FakePinCodeStore) {
    this.state = state;
    this.store = store;
  }

  async lockPinCodeTarget(userId: string): Promise<PinCodeTarget | undefined> {
    this.store.operationOrder.push("lockPinCodeTarget");
    const target = this.state.users.get(userId);
    return target ? { ...target } : undefined;
  }

  async lockFirstPinCodeTarget(
    registerId: string,
    userId: string,
  ): Promise<FirstPinCodeTarget | undefined> {
    this.store.operationOrder.push("lockFirstPinCodeTarget");
    const user = this.state.users.get(userId);
    const email = this.state.emails.get(userId);
    if (
      !user ||
      email === undefined ||
      !this.state.registerAccess.get(userId)?.includes(registerId)
    ) {
      return undefined;
    }
    return { active: user.active, hasPin: this.state.pins.has(userId), email };
  }

  async recordFirstPinCodeEmission(emission: FirstPinCodeEmission): Promise<void> {
    this.beforeWrite("recordFirstPinCodeEmission");
    this.state.firstEmissions.push(structuredClone(emission));
  }

  async queueFirstPinCodeEmail(email: QueuedFirstPinCodeEmail): Promise<void> {
    this.beforeWrite("queueFirstPinCodeEmail");
    this.state.queuedEmails.push(structuredClone(email));
  }

  async pinCodesIssuedSince(userId: string, since: Date): Promise<Date[]> {
    this.store.operationOrder.push("pinCodesIssuedSince");
    return this.state.codes
      .filter((code) => code.userId === userId && code.issuedAt > since)
      .map((code) => new Date(code.issuedAt));
  }

  async supersedeLivePinCodes(userId: string, supersededAt: Date): Promise<void> {
    this.beforeWrite("supersedeLivePinCodes");
    for (const code of this.state.codes) {
      if (code.userId === userId && code.redeemedAt === null && code.supersededAt === null) {
        code.supersededAt = new Date(supersededAt);
      }
    }
  }

  async removePin(userId: string): Promise<void> {
    this.beforeWrite("removePin");
    this.state.pins.delete(userId);
  }

  async recordPinCode(pinCode: NewPinCode): Promise<void> {
    this.beforeWrite("recordPinCode");
    this.state.codes.push({
      ...structuredClone(pinCode),
      failedAttempts: 0,
      redeemedAt: null,
      supersededAt: null,
    });
  }

  async recordPinCodeEmission(emission: PinCodeEmission): Promise<void> {
    this.beforeWrite("recordPinCodeEmission");
    this.state.emissions.push(structuredClone(emission));
  }

  async findPinCodeHolder(codeHash: string): Promise<string | undefined> {
    this.store.operationOrder.push("findPinCodeHolder");
    return this.state.codes.find((candidate) => candidate.codeHash === codeHash)?.userId;
  }

  async lockPinCodeHolder(userId: string): Promise<PinCodeHolder | undefined> {
    this.store.operationOrder.push("lockPinCodeHolder");
    const user = this.state.users.get(userId);
    return user ? { active: user.active } : undefined;
  }

  async lockHeldPinCode(userId: string, codeHash: string): Promise<LockedPinCode | undefined> {
    this.store.operationOrder.push("lockHeldPinCode");
    const code = this.state.codes.find(
      (candidate) => candidate.userId === userId && candidate.codeHash === codeHash,
    );
    if (!code) {
      return undefined;
    }
    return {
      expiresAt: new Date(code.expiresAt),
      failedAttempts: code.failedAttempts,
      redeemedAt: code.redeemedAt && new Date(code.redeemedAt),
      supersededAt: code.supersededAt && new Date(code.supersededAt),
    };
  }

  async lockPinCodeRedemptionAttempts(keys: readonly PinCodeRedemptionAttemptKey[]): Promise<void> {
    this.store.operationOrder.push("lockPinCodeRedemptionAttempts");
    this.store.lockedAttemptKeys.push(...keys.map((key) => ({ ...key })));
  }

  async acceptedPinCodeRedemptionAttempts(
    key: PinCodeRedemptionAttemptKey,
    since: Date,
  ): Promise<Date[]> {
    this.store.operationOrder.push("acceptedPinCodeRedemptionAttempts");
    return this.state.attempts
      .filter(
        (attempt) =>
          attempt.key.kind === key.kind &&
          attempt.key.value === key.value &&
          attempt.attemptedAt > since,
      )
      .map((attempt) => new Date(attempt.attemptedAt));
  }

  async recordPinCodeRedemptionAttempt(
    keys: readonly PinCodeRedemptionAttemptKey[],
    attemptedAt: Date,
  ): Promise<void> {
    this.beforeWrite("recordPinCodeRedemptionAttempt");
    for (const key of keys) {
      this.state.attempts.push({ key: { ...key }, attemptedAt: new Date(attemptedAt) });
    }
  }

  async recordFailedPinCodeRedemption(codeHash: string): Promise<void> {
    this.beforeWrite("recordFailedPinCodeRedemption");
    for (const code of this.state.codes) {
      if (code.codeHash === codeHash) {
        code.failedAttempts += 1;
      }
    }
  }

  async replacePin(userId: string, pin: HashedPin, changedAt: Date): Promise<void> {
    this.beforeWrite("replacePin");
    this.state.pins.set(userId, { ...pin });
    this.state.pinChanges.push({ userId, changedAt: new Date(changedAt) });
  }

  async markPinCodeRedeemed(codeHash: string, redeemedAt: Date): Promise<void> {
    this.beforeWrite("markPinCodeRedeemed");
    for (const code of this.state.codes) {
      if (code.codeHash === codeHash) {
        code.redeemedAt = new Date(redeemedAt);
      }
    }
  }

  async recordPinCodeRedemption(redemption: PinCodeRedemption): Promise<void> {
    this.beforeWrite("recordPinCodeRedemption");
    this.state.redemptions.push(structuredClone(redemption));
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakePinCodeStore implements PinCodeStore, PinCodeRedemptionStore, FirstPinCodeStore {
  private state: FakePinCodeState = {
    users: new Map(),
    pins: new Map(),
    codes: [],
    emissions: [],
    firstEmissions: [],
    queuedEmails: [],
    emails: new Map(),
    registerAccess: new Map(),
    attempts: [],
    redemptions: [],
    pinChanges: [],
  };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];
  lockedAttemptKeys: PinCodeRedemptionAttemptKey[] = [];

  seedUser(
    userId: string,
    target: PinCodeTarget,
    options: { hasPin?: boolean; email?: string; registerIds?: string[] } = {},
  ): void {
    this.state.users.set(userId, { ...target });
    this.state.emails.set(userId, options.email ?? `${userId}@example.com`);
    this.state.registerAccess.set(userId, options.registerIds ?? ["register-1"]);
    if (options.hasPin) {
      this.state.pins.set(userId, { salt: "old-salt", pinHash: "old-hash" });
    }
  }

  seedCode(code: Partial<FakePinCode> & Pick<FakePinCode, "userId" | "issuedAt">): void {
    this.state.codes.push({
      codeHash: `seeded-hash-${this.state.codes.length}`,
      issuedBy: "someone",
      expiresAt: new Date(code.issuedAt.getTime() + 15 * 60 * 1000),
      failedAttempts: 0,
      redeemedAt: null,
      supersededAt: null,
      ...structuredClone(code),
    });
  }

  seedAttempt(attempt: FakeRedemptionAttempt): void {
    this.state.attempts.push(structuredClone(attempt));
  }

  snapshot(): FakePinCodeState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: FakePinCodeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = cloneState(this.state);
    try {
      return await work(new FakePinCodeStoreTransaction(this.state, this));
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

export const hashOfPinCode = (code: string): string => `hash-of-${code}`;

export class SequentialPinCodes implements PinCodeGenerator {
  private generated = 0;

  generate(): GeneratedPinCode {
    this.generated += 1;
    const code = `PINCODE${String(this.generated).padStart(9, "0")}`;
    return { code, codeHash: hashOfPinCode(code) };
  }
}

export class FakePinHasher implements PinHasher {
  async hash(pin: string): Promise<HashedPin> {
    return { salt: `salt-for-${pin}`, pinHash: `hash-of-${pin}` };
  }
}
