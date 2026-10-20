import type {
  LockBranchRegisterResult,
  QrPointOfSaleAssignment,
  QrPointOfSaleAssignmentRecord,
  QrPointOfSaleAssignmentStore,
  QrPointOfSaleAssignmentStoreTransaction,
} from "../qr-point-of-sale-assignment-store.js";
import { QrPointOfSaleAlreadyAssigned } from "../qr-point-of-sale-assignment-store.js";

export interface FakeBranchRegister {
  id: string;
  locationId: string;
}

interface FakeRegisterQrPointOfSale extends Omit<QrPointOfSaleAssignmentRecord, "actorId"> {
  recordedBy: string | null;
}

export interface FakeQrPointOfSaleAssignmentState {
  registers: FakeBranchRegister[];
  registerQrPointOfSales: FakeRegisterQrPointOfSale[];
}

class FakeQrPointOfSaleAssignmentStoreTransaction
  implements QrPointOfSaleAssignmentStoreTransaction
{
  private readonly state: FakeQrPointOfSaleAssignmentState;
  private readonly store: FakeQrPointOfSaleAssignmentStore;

  constructor(state: FakeQrPointOfSaleAssignmentState, store: FakeQrPointOfSaleAssignmentStore) {
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

  async lockRegisterQrPointOfSale(registerId: string): Promise<QrPointOfSaleAssignment> {
    this.store.operationOrder.push("lockRegisterQrPointOfSale");
    const row = this.state.registerQrPointOfSales.find(
      (candidate) => candidate.registerId === registerId,
    );
    return { externalPosId: row?.externalPosId ?? null, version: row?.version ?? 0 };
  }

  async lockQrPointOfSaleHolder(externalPosId: string): Promise<string | undefined> {
    this.store.operationOrder.push("lockQrPointOfSaleHolder");
    return this.state.registerQrPointOfSales.find(
      (candidate) => candidate.externalPosId === externalPosId,
    )?.registerId;
  }

  async recordQrPointOfSaleAssignment(record: QrPointOfSaleAssignmentRecord): Promise<void> {
    this.store.operationOrder.push("recordQrPointOfSaleAssignment");
    if (this.store.failingWrites) {
      throw new Error("recordQrPointOfSaleAssignment failed");
    }
    if (record.externalPosId !== null && this.store.pointsOfSaleLostToRace.has(record.externalPosId)) {
      throw new QrPointOfSaleAlreadyAssigned();
    }
    const { actorId, ...row } = record;
    this.state.registerQrPointOfSales = this.state.registerQrPointOfSales.filter(
      (candidate) => candidate.registerId !== record.registerId,
    );
    this.state.registerQrPointOfSales.push({ ...row, recordedBy: actorId });
  }
}

export class FakeQrPointOfSaleAssignmentStore implements QrPointOfSaleAssignmentStore {
  private state: FakeQrPointOfSaleAssignmentState = { registers: [], registerQrPointOfSales: [] };

  failingWrites = false;
  pointsOfSaleLostToRace = new Set<string>();
  operationOrder: string[] = [];
  transactionCount = 0;

  seedRegister(register: FakeBranchRegister): void {
    this.state.registers.push({ ...register });
  }

  seedAssignment(assignment: Omit<QrPointOfSaleAssignmentRecord, "actorId">): void {
    this.state.registerQrPointOfSales.push({ ...assignment, recordedBy: null });
  }

  snapshot(): FakeQrPointOfSaleAssignmentState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: QrPointOfSaleAssignmentStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = structuredClone(this.state);
    try {
      return await work(new FakeQrPointOfSaleAssignmentStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
