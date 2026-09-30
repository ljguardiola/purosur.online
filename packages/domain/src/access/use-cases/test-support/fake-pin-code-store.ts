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

export interface FakePinCodeState {
  users: Map<string, PinCodeTarget>;
  pins: Set<string>;
  codes: FakePinCode[];
  emissions: PinCodeEmission[];
}

type WriteOperation =
  | "supersedeLivePinCodes"
  | "removePin"
  | "recordPinCode"
  | "recordPinCodeEmission";

function cloneState(state: FakePinCodeState): FakePinCodeState {
  return structuredClone(state);
}

class FakePinCodeStoreTransaction implements PinCodeStoreTransaction {
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

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakePinCodeStore implements PinCodeStore {
  private state: FakePinCodeState = {
    users: new Map(),
    pins: new Set(),
    codes: [],
    emissions: [],
  };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];

  seedUser(userId: string, target: PinCodeTarget, options: { hasPin?: boolean } = {}): void {
    this.state.users.set(userId, { ...target });
    if (options.hasPin) {
      this.state.pins.add(userId);
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

  snapshot(): FakePinCodeState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: PinCodeStoreTransaction) => Promise<TOutcome>,
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
