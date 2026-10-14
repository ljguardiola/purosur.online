import type {
  LockBranchRegisterResult,
  PointTerminalAssignment,
  PointTerminalAssignmentRecord,
  PointTerminalAssignmentStore,
  PointTerminalAssignmentStoreTransaction,
} from "../point-terminal-assignment-store.js";
import { PointTerminalAlreadyAssigned } from "../point-terminal-assignment-store.js";

export interface FakeBranchRegister {
  id: string;
  locationId: string;
}

interface FakeRegisterPointTerminal extends Omit<PointTerminalAssignmentRecord, "actorId"> {
  recordedBy: string | null;
}

export interface FakePointTerminalAssignmentState {
  registers: FakeBranchRegister[];
  registerPointTerminals: FakeRegisterPointTerminal[];
}

class FakePointTerminalAssignmentStoreTransaction
  implements PointTerminalAssignmentStoreTransaction
{
  private readonly state: FakePointTerminalAssignmentState;
  private readonly store: FakePointTerminalAssignmentStore;

  constructor(state: FakePointTerminalAssignmentState, store: FakePointTerminalAssignmentStore) {
    this.state = state;
    this.store = store;
  }

  async lockBranchRegister(
    locationId: string,
    registerId: string,
  ): Promise<LockBranchRegisterResult> {
    this.store.operationOrder.push("lockBranchRegister");
    return this.state.registers.some(
      (register) => register.id === registerId && register.locationId === locationId,
    )
      ? { kind: "locked" }
      : { kind: "not_found" };
  }

  async lockRegisterPointTerminal(registerId: string): Promise<PointTerminalAssignment> {
    this.store.operationOrder.push("lockRegisterPointTerminal");
    const row = this.state.registerPointTerminals.find(
      (candidate) => candidate.registerId === registerId,
    );
    return { terminalId: row?.terminalId ?? null, version: row?.version ?? 0 };
  }

  async lockPointTerminalHolder(terminalId: string): Promise<string | undefined> {
    this.store.operationOrder.push("lockPointTerminalHolder");
    return this.state.registerPointTerminals.find((candidate) => candidate.terminalId === terminalId)
      ?.registerId;
  }

  async recordPointTerminalAssignment(record: PointTerminalAssignmentRecord): Promise<void> {
    this.store.operationOrder.push("recordPointTerminalAssignment");
    if (this.store.failingWrites) {
      throw new Error("recordPointTerminalAssignment failed");
    }
    if (record.terminalId !== null && this.store.terminalsLostToRace.has(record.terminalId)) {
      throw new PointTerminalAlreadyAssigned();
    }
    const { actorId, ...row } = record;
    this.state.registerPointTerminals = this.state.registerPointTerminals.filter(
      (candidate) => candidate.registerId !== record.registerId,
    );
    this.state.registerPointTerminals.push({ ...row, recordedBy: actorId });
  }
}

export class FakePointTerminalAssignmentStore implements PointTerminalAssignmentStore {
  private state: FakePointTerminalAssignmentState = { registers: [], registerPointTerminals: [] };

  failingWrites = false;
  terminalsLostToRace = new Set<string>();
  operationOrder: string[] = [];
  transactionCount = 0;

  seedRegister(register: FakeBranchRegister): void {
    this.state.registers.push({ ...register });
  }

  seedAssignment(assignment: Omit<PointTerminalAssignmentRecord, "actorId">): void {
    this.state.registerPointTerminals.push({ ...assignment, recordedBy: null });
  }

  snapshot(): FakePointTerminalAssignmentState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: PointTerminalAssignmentStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = structuredClone(this.state);
    try {
      return await work(new FakePointTerminalAssignmentStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
