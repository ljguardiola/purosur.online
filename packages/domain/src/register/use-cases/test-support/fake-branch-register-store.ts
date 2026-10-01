import type {
  BranchRegister,
  BranchRegisterStore,
  BranchRegisterStoreTransaction,
  BranchRegisters,
  EnrollmentCodeEmission,
  EnrollmentCodeIssuer,
  IssuedEnrollmentCode,
  LockRegisterResult,
  NewEnrollmentCode,
  NewRegister,
  RegisterCreation,
  RegisterEnrollmentCode,
} from "../branch-register-store.js";
import { RegisterNameConflict } from "../branch-register-store.js";

export interface FakeBranchRegister {
  id: string;
  locationId: string;
  name: string;
  pointOfSaleNumber?: number;
}

export interface FakeRegisterEnrollmentCode extends RegisterEnrollmentCode {
  registerId: string;
  lookup: string;
  codeHash: string;
}

export interface FakeBranchRegisterState {
  registers: FakeBranchRegister[];
  codes: FakeRegisterEnrollmentCode[];
  registerCreations: RegisterCreation[];
  codeEmissions: EnrollmentCodeEmission[];
  nextId: number;
}

type WriteOperation =
  | "recordRegister"
  | "recordRegisterCreation"
  | "recordEnrollmentCode"
  | "recordEnrollmentCodeEmission";

class FakeBranchRegisterStoreTransaction implements BranchRegisterStoreTransaction {
  private readonly state: FakeBranchRegisterState;
  private readonly store: FakeBranchRegisterStore;

  constructor(state: FakeBranchRegisterState, store: FakeBranchRegisterStore) {
    this.state = state;
    this.store = store;
  }

  async registerNameTaken(locationId: string, name: string): Promise<boolean> {
    this.store.operationOrder.push("registerNameTaken");
    return this.state.registers.some(
      (register) =>
        register.locationId === locationId && register.name.toLowerCase() === name.toLowerCase(),
    );
  }

  async recordRegister(register: NewRegister): Promise<{ id: string }> {
    this.beforeWrite("recordRegister");
    if (this.store.registerNameConflicts.has(register.name.toLowerCase())) {
      throw new RegisterNameConflict();
    }
    const id = `register-${this.state.nextId++}`;
    this.state.registers.push({ id, ...register });
    return { id };
  }

  async recordRegisterCreation(creation: RegisterCreation): Promise<void> {
    this.beforeWrite("recordRegisterCreation");
    this.state.registerCreations.push({ ...creation });
  }

  async lockBranchRegister(locationId: string, registerId: string): Promise<LockRegisterResult> {
    this.store.operationOrder.push("lockBranchRegister");
    return this.state.registers.some(
      (register) => register.id === registerId && register.locationId === locationId,
    )
      ? { kind: "locked" }
      : { kind: "not_found" };
  }

  async lockEnrollmentCode(registerId: string): Promise<FakeRegisterEnrollmentCode | undefined> {
    this.store.operationOrder.push("lockEnrollmentCode");
    const code = this.state.codes.find((row) => row.registerId === registerId);
    return code ? structuredClone(code) : undefined;
  }

  async recordEnrollmentCode(code: NewEnrollmentCode): Promise<void> {
    this.beforeWrite("recordEnrollmentCode");
    this.state.codes = this.state.codes.filter((row) => row.registerId !== code.registerId);
    this.state.codes.push({ ...structuredClone(code), redeemedAt: null, failedAttempts: 0 });
  }

  async recordEnrollmentCodeEmission(emission: EnrollmentCodeEmission): Promise<void> {
    this.beforeWrite("recordEnrollmentCodeEmission");
    this.state.codeEmissions.push(structuredClone(emission));
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeBranchRegisterStore implements BranchRegisterStore, BranchRegisters {
  private state: FakeBranchRegisterState = {
    registers: [],
    codes: [],
    registerCreations: [],
    codeEmissions: [],
    nextId: 1,
  };

  failingWrites = new Set<WriteOperation>();
  registerNameConflicts = new Set<string>();
  operationOrder: string[] = [];
  transactionCount = 0;

  seedRegister(register: FakeBranchRegister): void {
    this.state.registers.push({ ...register });
  }

  seedCode(code: FakeRegisterEnrollmentCode): void {
    this.state.codes.push(structuredClone(code));
  }

  snapshot(): FakeBranchRegisterState {
    return structuredClone(this.state);
  }

  async branchRegisters(locationId: string): Promise<BranchRegister[]> {
    return this.state.registers
      .filter((register) => register.locationId === locationId)
      .map((register) => {
        const code = this.state.codes.find((row) => row.registerId === register.id);
        return {
          id: register.id,
          name: register.name,
          enrollmentCode: code
            ? {
                issuedAt: new Date(code.issuedAt),
                expiresAt: new Date(code.expiresAt),
                redeemedAt: code.redeemedAt ? new Date(code.redeemedAt) : null,
                failedAttempts: code.failedAttempts,
              }
            : null,
          pointOfSaleNumber: register.pointOfSaleNumber ?? null,
        };
      });
  }

  async hasRegister(locationId: string, registerId: string): Promise<boolean> {
    return this.state.registers.some(
      (register) => register.id === registerId && register.locationId === locationId,
    );
  }

  async transaction<TOutcome>(
    work: (tx: BranchRegisterStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = structuredClone(this.state);
    try {
      return await work(new FakeBranchRegisterStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}

export class SequentialEnrollmentCodes implements EnrollmentCodeIssuer {
  private issued = 0;

  issue(): IssuedEnrollmentCode {
    this.issued += 1;
    const code = `CODE${String(this.issued).padStart(12, "A")}`;
    return { code, codeHash: `hash-of-${code}` };
  }
}
