import type {
  BranchRegisterPointOfSale,
  LockBranchRegisterResult,
  PointOfSaleClaim,
  RegisterPointOfSale,
  RegisterPointOfSaleReader,
  RegisterPointOfSaleRecord,
  RegisterPointOfSaleStore,
  RegisterPointOfSaleStoreTransaction,
} from "../register-point-of-sale-store.js";
import { PointOfSaleClaimConflict } from "../register-point-of-sale-store.js";

export interface FakeBranchRegister {
  id: string;
  locationId: string;
  name: string;
}

interface FakeRegisterPointOfSale extends Omit<RegisterPointOfSaleRecord, "actorId"> {
  recordedBy: string | null;
}

export interface FakePointOfSaleClaim {
  pointOfSaleNumber: number;
  registerId: string;
}

export interface FakeRegisterPointOfSaleState {
  registers: FakeBranchRegister[];
  fiscalAddressIds: string[];
  registerPointsOfSale: FakeRegisterPointOfSale[];
  pointOfSaleClaims: FakePointOfSaleClaim[];
}

type WriteOperation = "claimPointOfSale" | "recordRegisterPointOfSale";

class FakeRegisterPointOfSaleStoreTransaction implements RegisterPointOfSaleStoreTransaction {
  private readonly state: FakeRegisterPointOfSaleState;
  private readonly store: FakeRegisterPointOfSaleStore;

  constructor(state: FakeRegisterPointOfSaleState, store: FakeRegisterPointOfSaleStore) {
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

  async lockRegisterPointOfSale(registerId: string): Promise<RegisterPointOfSale> {
    this.store.operationOrder.push("lockRegisterPointOfSale");
    const row = this.state.registerPointsOfSale.find(
      (candidate) => candidate.registerId === registerId,
    );
    return {
      pointOfSaleNumber: row?.pointOfSaleNumber ?? null,
      fiscalAddressId: row?.fiscalAddressId ?? null,
      version: row?.version ?? 0,
    };
  }

  async fiscalAddressExists(fiscalAddressId: string): Promise<boolean> {
    this.store.operationOrder.push("fiscalAddressExists");
    return this.state.fiscalAddressIds.includes(fiscalAddressId);
  }

  async lockPointOfSaleClaim(pointOfSaleNumber: number): Promise<string | undefined> {
    this.store.operationOrder.push("lockPointOfSaleClaim");
    return this.state.pointOfSaleClaims.find(
      (claim) => claim.pointOfSaleNumber === pointOfSaleNumber,
    )?.registerId;
  }

  async claimPointOfSale(claim: PointOfSaleClaim): Promise<void> {
    this.beforeWrite("claimPointOfSale");
    if (this.store.pointOfSaleClaimConflicts.has(claim.pointOfSaleNumber)) {
      throw new PointOfSaleClaimConflict();
    }
    this.state.pointOfSaleClaims.push({
      pointOfSaleNumber: claim.pointOfSaleNumber,
      registerId: claim.registerId,
    });
  }

  async recordRegisterPointOfSale(record: RegisterPointOfSaleRecord): Promise<void> {
    this.beforeWrite("recordRegisterPointOfSale");
    const { actorId, ...row } = record;
    this.state.registerPointsOfSale = this.state.registerPointsOfSale.filter(
      (candidate) => candidate.registerId !== record.registerId,
    );
    this.state.registerPointsOfSale.push({ ...row, recordedBy: actorId });
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeRegisterPointOfSaleStore
  implements RegisterPointOfSaleStore, RegisterPointOfSaleReader
{
  private state: FakeRegisterPointOfSaleState = {
    registers: [],
    fiscalAddressIds: [],
    registerPointsOfSale: [],
    pointOfSaleClaims: [],
  };

  failingWrites = new Set<WriteOperation>();
  pointOfSaleClaimConflicts = new Set<number>();
  operationOrder: string[] = [];
  transactionCount = 0;

  seedRegister(register: FakeBranchRegister): void {
    this.state.registers.push({ ...register });
  }

  seedFiscalAddress(fiscalAddressId: string): void {
    this.state.fiscalAddressIds.push(fiscalAddressId);
  }

  seedRegisterPointOfSale(setup: Omit<RegisterPointOfSaleRecord, "actorId">): void {
    this.state.registerPointsOfSale.push({ ...setup, recordedBy: null });
  }

  seedPointOfSaleClaim(claim: FakePointOfSaleClaim): void {
    this.state.pointOfSaleClaims.push({ ...claim });
  }

  snapshot(): FakeRegisterPointOfSaleState {
    return structuredClone(this.state);
  }

  async listBranchRegisterPointsOfSale(locationId: string): Promise<BranchRegisterPointOfSale[]> {
    return this.state.registers
      .filter((register) => register.locationId === locationId)
      .map((register) => {
        const setup = this.state.registerPointsOfSale.find((row) => row.registerId === register.id);
        return {
          registerId: register.id,
          registerName: register.name,
          pointOfSaleNumber: setup?.pointOfSaleNumber ?? null,
          fiscalAddressId: setup?.fiscalAddressId ?? null,
          version: setup?.version ?? 0,
        };
      });
  }

  async transaction<TOutcome>(
    work: (tx: RegisterPointOfSaleStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = structuredClone(this.state);
    try {
      return await work(new FakeRegisterPointOfSaleStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
