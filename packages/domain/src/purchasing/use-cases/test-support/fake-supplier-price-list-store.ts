import {
  countsTowardDailyExtractionCap,
  DEFAULT_SUPPLIER_PRICE_LIST_DAILY_EXTRACTION_CAP,
  type SupplierPriceListReadFailure,
  type SupplierPriceListSourceKind,
  type SupplierPriceListState,
} from "../../model/supplier-price-list.js";
import type {
  FindPriceListSupplierResult,
  LockSupplierPriceListResult,
  LockSupplierPriceListRowResult,
  NewSupplierPriceListFields,
  ProposedPriceListRow,
  SupplierPriceListStore,
  SupplierPriceListStoreTransaction,
} from "../supplier-price-list-store.js";

export interface FakePriceListSupplierRow {
  id: string;
  name: string;
  active: boolean;
}

export interface FakeSupplierPriceListRow {
  id: string;
  locationId: string;
  supplierId: string;
  sourceKind: SupplierPriceListSourceKind;
  fileName: string;
  byteSize: number;
  uploadedAt: Date;
  uploadedBy: string;
  state: SupplierPriceListState;
  version: number;
  listDate: string | null;
  sentAt: Date | null;
  sentOn: string | null;
  readFailure: SupplierPriceListReadFailure | null;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  discardedAt: Date | null;
  discardedBy: string | null;
}

export interface FakePriceListRow extends ProposedPriceListRow {
  id: string;
  listId: string;
  position: number;
  editedBy: string | null;
}

export type FakeSupplierPriceListWrite =
  | "insertList"
  | "enqueueReading"
  | "markSent"
  | "recordExtraction"
  | "recordReadFailure"
  | "setRowPrice"
  | "removeRow"
  | "confirmList"
  | "discardList";

export interface FakeSupplierPriceListState {
  suppliers: FakePriceListSupplierRow[];
  lists: FakeSupplierPriceListRow[];
  rows: FakePriceListRow[];
  readingQueue: string[];
  nextId: number;
}

function cloneState(state: FakeSupplierPriceListState): FakeSupplierPriceListState {
  const instant = (value: Date | null) => (value === null ? null : new Date(value));
  return {
    suppliers: state.suppliers.map((row) => ({ ...row })),
    lists: state.lists.map((row) => ({
      ...row,
      uploadedAt: new Date(row.uploadedAt),
      sentAt: instant(row.sentAt),
      confirmedAt: instant(row.confirmedAt),
      discardedAt: instant(row.discardedAt),
    })),
    rows: state.rows.map((row) => ({ ...row })),
    readingQueue: [...state.readingQueue],
    nextId: state.nextId,
  };
}

class FakeSupplierPriceListStoreTransaction implements SupplierPriceListStoreTransaction {
  private readonly state: FakeSupplierPriceListState;
  private readonly store: FakeSupplierPriceListStore;

  constructor(state: FakeSupplierPriceListState, store: FakeSupplierPriceListStore) {
    this.state = state;
    this.store = store;
  }

  async lockBranchExtractionQuota(locationId: string): Promise<{ cap: number }> {
    this.store.lockCallOrder.push("lockBranchExtractionQuota");
    return {
      cap:
        this.store.branchCaps.get(locationId) ?? DEFAULT_SUPPLIER_PRICE_LIST_DAILY_EXTRACTION_CAP,
    };
  }

  async extractionsCountedOn(locationId: string, day: string): Promise<number> {
    return this.state.lists.filter(
      (list) => list.locationId === locationId && countsTowardDailyExtractionCap(list, day),
    ).length;
  }

  async findSupplier(supplierId: string): Promise<FindPriceListSupplierResult> {
    const supplier = this.state.suppliers.find((row) => row.id === supplierId);
    return supplier
      ? { kind: "found", supplier: { id: supplier.id, active: supplier.active } }
      : { kind: "not_found" };
  }

  async insertList(fields: NewSupplierPriceListFields): Promise<{ id: string }> {
    this.beforeWrite("insertList");
    const id = `list-${this.state.nextId++}`;
    this.state.lists.push({
      id,
      locationId: fields.locationId,
      supplierId: fields.supplierId,
      sourceKind: fields.sourceKind,
      fileName: fields.fileName,
      byteSize: fields.byteSize,
      uploadedAt: fields.uploadedAt,
      uploadedBy: fields.actorId,
      state: "READING",
      version: 1,
      listDate: null,
      sentAt: null,
      sentOn: null,
      readFailure: null,
      confirmedAt: null,
      confirmedBy: null,
      discardedAt: null,
      discardedBy: null,
    });
    return { id };
  }

  async enqueueReading(listId: string): Promise<void> {
    this.beforeWrite("enqueueReading");
    this.state.readingQueue.push(listId);
  }

  async lockList(listId: string): Promise<LockSupplierPriceListResult> {
    this.store.lockCallOrder.push("lockList");
    const list = this.state.lists.find((row) => row.id === listId);
    if (!list) {
      return { kind: "not_found" };
    }
    return {
      kind: "locked",
      list: {
        id: list.id,
        sourceKind: list.sourceKind,
        state: list.state,
        version: list.version,
        listDate: list.listDate,
        sentAt: list.sentAt,
        rowPrices: this.state.rows
          .filter((row) => row.listId === listId)
          .map((row) => row.priceCents),
      },
    };
  }

  async markSent(listId: string, sentAt: Date, sentOn: string): Promise<void> {
    this.beforeWrite("markSent");
    const list = this.listRow(listId);
    list.sentAt = sentAt;
    list.sentOn = sentOn;
  }

  async recordExtraction(
    listId: string,
    listDate: string | null,
    rows: ProposedPriceListRow[],
  ): Promise<void> {
    this.beforeWrite("recordExtraction");
    const list = this.listRow(listId);
    list.state = "EXTRACTED";
    list.listDate = listDate;
    list.version += 1;
    rows.forEach((row, position) => {
      this.state.rows.push({
        ...row,
        id: `row-${this.state.nextId++}`,
        listId,
        position,
        editedBy: null,
      });
    });
  }

  async recordReadFailure(listId: string, reason: SupplierPriceListReadFailure): Promise<void> {
    this.beforeWrite("recordReadFailure");
    const list = this.listRow(listId);
    list.state = "READ_FAILED";
    list.readFailure = reason;
    list.version += 1;
  }

  async lockRow(listId: string, rowId: string): Promise<LockSupplierPriceListRowResult> {
    this.store.lockCallOrder.push("lockRow");
    return this.state.rows.some((row) => row.id === rowId && row.listId === listId)
      ? { kind: "locked" }
      : { kind: "not_found" };
  }

  async setRowPrice(
    listId: string,
    rowId: string,
    priceCents: number,
    actorId: string,
  ): Promise<void> {
    this.beforeWrite("setRowPrice");
    for (const row of this.state.rows) {
      if (row.id === rowId && row.listId === listId) {
        row.priceCents = priceCents;
        row.editedBy = actorId;
      }
    }
    this.listRow(listId).version += 1;
  }

  async removeRow(listId: string, rowId: string, _actorId: string): Promise<void> {
    this.beforeWrite("removeRow");
    this.state.rows = this.state.rows.filter((row) => !(row.id === rowId && row.listId === listId));
    this.listRow(listId).version += 1;
  }

  async confirmList(
    listId: string,
    listDate: string,
    confirmedAt: Date,
    actorId: string,
  ): Promise<void> {
    this.beforeWrite("confirmList");
    const list = this.listRow(listId);
    list.state = "REVIEWED";
    list.listDate = listDate;
    list.confirmedAt = confirmedAt;
    list.confirmedBy = actorId;
    list.version += 1;
  }

  async discardList(listId: string, discardedAt: Date, actorId: string): Promise<void> {
    this.beforeWrite("discardList");
    const list = this.listRow(listId);
    list.state = "DISCARDED";
    list.discardedAt = discardedAt;
    list.discardedBy = actorId;
    list.version += 1;
  }

  private listRow(listId: string): FakeSupplierPriceListRow {
    const list = this.state.lists.find((row) => row.id === listId);
    if (!list) {
      throw new Error(`no list ${listId}`);
    }
    return list;
  }

  private beforeWrite(operation: FakeSupplierPriceListWrite): void {
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeSupplierPriceListStore implements SupplierPriceListStore {
  private state: FakeSupplierPriceListState = {
    suppliers: [],
    lists: [],
    rows: [],
    readingQueue: [],
    nextId: 1,
  };

  branchCaps = new Map<string, number>();
  failingWrites = new Set<FakeSupplierPriceListWrite>();
  lockCallOrder: string[] = [];
  transactionCount = 0;

  seedSupplier(supplier: FakePriceListSupplierRow): void {
    this.state.suppliers.push({ ...supplier });
  }

  seedList(list: Partial<FakeSupplierPriceListRow> & { id: string }): void {
    this.state.lists.push({
      locationId: "branch-1",
      supplierId: "supplier-a",
      sourceKind: "PDF",
      fileName: "lista.pdf",
      byteSize: 1_000,
      uploadedAt: new Date("2026-03-01T12:00:00Z"),
      uploadedBy: "person-1",
      state: "READING",
      version: 1,
      listDate: null,
      sentAt: null,
      sentOn: null,
      readFailure: null,
      confirmedAt: null,
      confirmedBy: null,
      discardedAt: null,
      discardedBy: null,
      ...list,
    });
  }

  seedRow(row: Partial<FakePriceListRow> & { id: string; listId: string }): void {
    this.state.rows.push({
      position: this.state.rows.filter((other) => other.listId === row.listId).length,
      description: "Yerba 1 kg",
      code: null,
      presentation: null,
      priceCents: 100,
      page: null,
      editedBy: null,
      ...row,
    });
  }

  snapshot(): FakeSupplierPriceListState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: SupplierPriceListStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneState(this.state);
    try {
      return await work(new FakeSupplierPriceListStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
