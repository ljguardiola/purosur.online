import type { FiscalDocumentType } from "../../model/fiscal-rejection-standing.js";
import type { PointOfSaleMechanism } from "../../model/point-of-sale.js";
import type {
  OfflineNumberBlockRecord,
  OfflineNumberBlockStore,
} from "../offline-number-block-store.js";
import type {
  RetireOfflinePointOfSaleRecord,
  RetireOfflinePointOfSaleStore,
  RetireOfflinePointOfSaleStoreTransaction,
} from "../retire-offline-point-of-sale-store.js";
import type {
  RegisterOfflinePointOfSale,
  RegisterOfflinePointOfSaleRecord,
  RegisterOfflinePointOfSaleStore,
  RegisterOfflinePointOfSaleStoreTransaction,
} from "../register-offline-point-of-sale-store.js";
import type {
  BranchRegisterPointOfSale,
  LockBranchRegisterResult,
  PointOfSaleClaim,
  PointOfSaleHolder,
  RegisterPointOfSale,
  RegisterPointOfSaleReader,
  RegisterPointOfSaleRecord,
  RegisterPointOfSaleStore,
  RegisterPointOfSaleStoreTransaction,
} from "../register-point-of-sale-store.js";
import { PointOfSaleClaimConflict } from "../register-point-of-sale-store.js";
import {
  FakeOfflineNumberBlocks,
  type LockedOfflineNumberSeries,
} from "./fake-offline-number-blocks.js";

export interface FakeBranchRegister {
  id: string;
  locationId: string;
  name: string;
}

interface FakeRegisterPointOfSale extends Omit<RegisterPointOfSaleRecord, "actorId"> {
  recordedBy: string | null;
}

interface FakeRegisterOfflinePointOfSale extends Omit<RegisterOfflinePointOfSaleRecord, "actorId"> {
  recordedBy: string | null;
}

export interface FakePointOfSaleClaim {
  pointOfSaleNumber: number;
  registerId: string;
  mechanism: PointOfSaleMechanism;
}

export interface FakePointOfSaleRetirement {
  pointOfSaleNumber: number;
  retiredAt: Date;
  recordedBy: string | null;
}

export interface FakeRegisterPointOfSaleState {
  registers: FakeBranchRegister[];
  fiscalAddressIds: string[];
  registerPointsOfSale: FakeRegisterPointOfSale[];
  registerOfflinePointsOfSale: FakeRegisterOfflinePointOfSale[];
  pointOfSaleClaims: FakePointOfSaleClaim[];
  pointOfSaleRetirements: FakePointOfSaleRetirement[];
  offlineNumberBlocks: OfflineNumberBlockRecord[];
  taxAuthorityCounts: [pointOfSaleNumber: number, lastAuthorized: number][];
  requiredTaxAuthorityCounts: number[];
  highestSyncedNumbers: [pointOfSaleNumber: number, highest: number][];
}

type WriteOperation =
  | "claimPointOfSale"
  | "recordRegisterPointOfSale"
  | "recordRegisterOfflinePointOfSale"
  | "retirePointOfSale"
  | "recordOfflineNumberBlock";

class FakeRegisterPointOfSaleStoreTransaction implements RegisterPointOfSaleStoreTransaction {
  protected readonly state: FakeRegisterPointOfSaleState;
  protected readonly store: FakeRegisterPointOfSaleStore;

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

  async lockPointOfSaleClaim(pointOfSaleNumber: number): Promise<PointOfSaleHolder | undefined> {
    this.store.operationOrder.push("lockPointOfSaleClaim");
    const claim = this.state.pointOfSaleClaims.find(
      (candidate) => candidate.pointOfSaleNumber === pointOfSaleNumber,
    );
    return claim && this.holderOf(claim);
  }

  protected holderOf(claim: FakePointOfSaleClaim): PointOfSaleHolder {
    const retirement = this.state.pointOfSaleRetirements.find(
      (candidate) => candidate.pointOfSaleNumber === claim.pointOfSaleNumber,
    );
    return {
      registerId: claim.registerId,
      mechanism: claim.mechanism,
      ...(retirement && { retiredAt: new Date(retirement.retiredAt) }),
    };
  }

  async claimPointOfSale(claim: PointOfSaleClaim): Promise<void> {
    this.beforeWrite("claimPointOfSale");
    if (this.store.pointOfSaleClaimConflicts.has(claim.pointOfSaleNumber)) {
      throw new PointOfSaleClaimConflict();
    }
    this.state.pointOfSaleClaims.push({
      pointOfSaleNumber: claim.pointOfSaleNumber,
      registerId: claim.registerId,
      mechanism: claim.mechanism,
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

  protected beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

class FakeRegisterOfflinePointOfSaleStoreTransaction
  extends FakeRegisterPointOfSaleStoreTransaction
  implements RegisterOfflinePointOfSaleStoreTransaction, OfflineNumberBlockStore
{
  private readonly blocks: FakeOfflineNumberBlocks;

  constructor(state: FakeRegisterPointOfSaleState, store: FakeRegisterPointOfSaleStore) {
    super(state, store);
    this.blocks = new FakeOfflineNumberBlocks(
      state.offlineNumberBlocks,
      store.operationOrder,
      () => {
        if (store.failingWrites.has("recordOfflineNumberBlock")) {
          throw new Error("recordOfflineNumberBlock failed");
        }
      },
      new Map(state.taxAuthorityCounts),
      state.requiredTaxAuthorityCounts,
      new Map(state.highestSyncedNumbers),
      store.offlineNumberBlockLocks,
    );
  }

  taxAuthorityLastAuthorized(pointOfSaleNumber: number): Promise<number | null> {
    return this.blocks.taxAuthorityLastAuthorized(pointOfSaleNumber);
  }

  requireTaxAuthorityCount(pointOfSaleNumber: number): Promise<void> {
    return this.blocks.requireTaxAuthorityCount(pointOfSaleNumber);
  }

  async lockPointOfSale(pointOfSaleNumber: number): Promise<void> {
    this.store.operationOrder.push("lockPointOfSale");
    this.store.lockedPointsOfSale.push(pointOfSaleNumber);
  }

  async offlineRegisterOf(pointOfSaleNumber: number): Promise<string | null> {
    this.store.operationOrder.push("offlineRegisterOf");
    const row = this.state.registerOfflinePointsOfSale.find(
      (candidate) => candidate.pointOfSaleNumber === pointOfSaleNumber,
    );
    return row?.registerId ?? null;
  }

  lockOfflineNumberBlocks(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<void> {
    return this.blocks.lockOfflineNumberBlocks(pointOfSaleNumber, documentType);
  }

  offlineNumberBlockInUse(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<OfflineNumberBlockRecord | null> {
    return this.blocks.offlineNumberBlockInUse(pointOfSaleNumber, documentType);
  }

  highestSyncedOfflineNumber(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<number | null> {
    return this.blocks.highestSyncedOfflineNumber(pointOfSaleNumber, documentType);
  }

  markOfflineNumberBlockUsedUp(block: OfflineNumberBlockRecord): Promise<void> {
    return this.blocks.markOfflineNumberBlockUsedUp(block);
  }

  recordOfflineNumberBlock(record: OfflineNumberBlockRecord): Promise<void> {
    return this.blocks.recordOfflineNumberBlock(record);
  }

  async lockRegisterOfflinePointOfSale(registerId: string): Promise<RegisterOfflinePointOfSale> {
    this.store.operationOrder.push("lockRegisterOfflinePointOfSale");
    const row = this.state.registerOfflinePointsOfSale.find(
      (candidate) => candidate.registerId === registerId,
    );
    return { pointOfSaleNumber: row?.pointOfSaleNumber ?? null, version: row?.version ?? 0 };
  }

  async recordRegisterOfflinePointOfSale(record: RegisterOfflinePointOfSaleRecord): Promise<void> {
    this.beforeWrite("recordRegisterOfflinePointOfSale");
    const { actorId, ...row } = record;
    this.state.registerOfflinePointsOfSale = this.state.registerOfflinePointsOfSale.filter(
      (candidate) => candidate.registerId !== record.registerId,
    );
    this.state.registerOfflinePointsOfSale.push({ ...row, recordedBy: actorId });
  }
}

class FakeRetireOfflinePointOfSaleStoreTransaction
  extends FakeRegisterOfflinePointOfSaleStoreTransaction
  implements RetireOfflinePointOfSaleStoreTransaction
{
  async branchPointOfSaleClaim(
    locationId: string,
    pointOfSaleNumber: number,
  ): Promise<PointOfSaleHolder | undefined> {
    this.store.operationOrder.push("branchPointOfSaleClaim");
    const claim = this.state.pointOfSaleClaims.find(
      (candidate) =>
        candidate.pointOfSaleNumber === pointOfSaleNumber &&
        this.state.registers.some(
          (register) => register.id === candidate.registerId && register.locationId === locationId,
        ),
    );
    if (claim === undefined) {
      return undefined;
    }
    return this.holderOf(claim);
  }

  async retirePointOfSale(record: RetireOfflinePointOfSaleRecord): Promise<void> {
    this.beforeWrite("retirePointOfSale");
    this.state.pointOfSaleRetirements.push({
      pointOfSaleNumber: record.pointOfSaleNumber,
      retiredAt: new Date(record.retiredAt),
      recordedBy: record.actorId,
    });
  }
}

export class FakeRegisterPointOfSaleStore
  implements RegisterPointOfSaleStore, RegisterPointOfSaleReader
{
  private state: FakeRegisterPointOfSaleState = {
    registers: [],
    fiscalAddressIds: [],
    registerPointsOfSale: [],
    registerOfflinePointsOfSale: [],
    pointOfSaleClaims: [],
    pointOfSaleRetirements: [],
    offlineNumberBlocks: [],
    taxAuthorityCounts: [],
    requiredTaxAuthorityCounts: [],
    highestSyncedNumbers: [],
  };

  failingWrites = new Set<WriteOperation>();
  pointOfSaleClaimConflicts = new Set<number>();
  operationOrder: string[] = [];
  lockedPointsOfSale: number[] = [];
  offlineNumberBlockLocks: LockedOfflineNumberSeries[] = [];
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

  seedRegisterOfflinePointOfSale(setup: Omit<RegisterOfflinePointOfSaleRecord, "actorId">): void {
    this.state.registerOfflinePointsOfSale.push({ ...setup, recordedBy: null });
  }

  seedPointOfSaleClaim(claim: FakePointOfSaleClaim): void {
    this.state.pointOfSaleClaims.push({ ...claim });
  }

  seedPointOfSaleRetirement(retirement: Omit<FakePointOfSaleRetirement, "recordedBy">): void {
    this.state.pointOfSaleRetirements.push({ ...retirement, recordedBy: null });
  }

  seedOfflineNumberBlock(block: OfflineNumberBlockRecord): void {
    this.state.offlineNumberBlocks.push(structuredClone(block));
  }

  seedTaxAuthorityCount(pointOfSaleNumber: number, lastAuthorized: number): void {
    this.state.taxAuthorityCounts.push([pointOfSaleNumber, lastAuthorized]);
  }

  seedHighestSyncedOfflineNumber(pointOfSaleNumber: number, highest: number): void {
    this.state.highestSyncedNumbers.push([pointOfSaleNumber, highest]);
  }

  snapshot(): FakeRegisterPointOfSaleState {
    return structuredClone(this.state);
  }

  async listBranchRegisterPointsOfSale(locationId: string): Promise<BranchRegisterPointOfSale[]> {
    return this.state.registers
      .filter((register) => register.locationId === locationId)
      .map((register) => {
        const setup = this.state.registerPointsOfSale.find((row) => row.registerId === register.id);
        const offline = this.state.registerOfflinePointsOfSale.find(
          (row) => row.registerId === register.id,
        );
        return {
          registerId: register.id,
          registerName: register.name,
          pointOfSaleNumber: setup?.pointOfSaleNumber ?? null,
          fiscalAddressId: setup?.fiscalAddressId ?? null,
          version: setup?.version ?? 0,
          offlinePointOfSaleNumber: offline?.pointOfSaleNumber ?? null,
          offlineVersion: offline?.version ?? 0,
        };
      });
  }

  readonly offline: RegisterOfflinePointOfSaleStore = {
    transaction: (work) =>
      this.run((state) => work(new FakeRegisterOfflinePointOfSaleStoreTransaction(state, this))),
  };

  readonly retirement: RetireOfflinePointOfSaleStore = {
    transaction: (work) =>
      this.run((state) => work(new FakeRetireOfflinePointOfSaleStoreTransaction(state, this))),
  };

  transaction<TOutcome>(
    work: (tx: RegisterPointOfSaleStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.run((state) => work(new FakeRegisterPointOfSaleStoreTransaction(state, this)));
  }

  private async run<TOutcome>(
    work: (state: FakeRegisterPointOfSaleState) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = structuredClone(this.state);
    try {
      return await work(this.state);
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
