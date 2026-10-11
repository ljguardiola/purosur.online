import type { FiscalDocumentType } from "../../model/fiscal-rejection-alert.js";
import type { PointOfSaleMechanism } from "../../model/point-of-sale.js";
import type {
  OfflineNumberBlockRecord,
  OfflineNumberBlockStore,
} from "../offline-number-block-store.js";
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
import { FakeOfflineNumberBlocks } from "./fake-offline-number-blocks.js";

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

export interface FakeRegisterPointOfSaleState {
  registers: FakeBranchRegister[];
  fiscalAddressIds: string[];
  registerPointsOfSale: FakeRegisterPointOfSale[];
  registerOfflinePointsOfSale: FakeRegisterOfflinePointOfSale[];
  pointOfSaleClaims: FakePointOfSaleClaim[];
  offlineNumberBlocks: OfflineNumberBlockRecord[];
  taxAuthorityCounts: [pointOfSaleNumber: number, lastAuthorized: number][];
  requiredTaxAuthorityCounts: number[];
}

type WriteOperation =
  | "claimPointOfSale"
  | "recordRegisterPointOfSale"
  | "recordRegisterOfflinePointOfSale"
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
    return claim && { registerId: claim.registerId, mechanism: claim.mechanism };
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
    );
  }

  taxAuthorityLastAuthorized(pointOfSaleNumber: number): Promise<number | null> {
    return this.blocks.taxAuthorityLastAuthorized(pointOfSaleNumber);
  }

  requireTaxAuthorityCount(pointOfSaleNumber: number): Promise<void> {
    return this.blocks.requireTaxAuthorityCount(pointOfSaleNumber);
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

  hasOfflineNumberBlock(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<boolean> {
    return this.blocks.hasOfflineNumberBlock(pointOfSaleNumber, documentType);
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

export class FakeRegisterPointOfSaleStore
  implements RegisterPointOfSaleStore, RegisterPointOfSaleReader
{
  private state: FakeRegisterPointOfSaleState = {
    registers: [],
    fiscalAddressIds: [],
    registerPointsOfSale: [],
    registerOfflinePointsOfSale: [],
    pointOfSaleClaims: [],
    offlineNumberBlocks: [],
    taxAuthorityCounts: [],
    requiredTaxAuthorityCounts: [],
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

  seedRegisterOfflinePointOfSale(setup: Omit<RegisterOfflinePointOfSaleRecord, "actorId">): void {
    this.state.registerOfflinePointsOfSale.push({ ...setup, recordedBy: null });
  }

  seedPointOfSaleClaim(claim: FakePointOfSaleClaim): void {
    this.state.pointOfSaleClaims.push({ ...claim });
  }

  seedOfflineNumberBlock(block: OfflineNumberBlockRecord): void {
    this.state.offlineNumberBlocks.push(structuredClone(block));
  }

  seedTaxAuthorityCount(pointOfSaleNumber: number, lastAuthorized: number): void {
    this.state.taxAuthorityCounts.push([pointOfSaleNumber, lastAuthorized]);
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
