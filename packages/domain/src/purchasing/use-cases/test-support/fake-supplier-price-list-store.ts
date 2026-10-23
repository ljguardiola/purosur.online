import type { SaleUnit } from "../../../catalog/index.js";
import { type SupplierItemKey, supplierItemKey } from "../../model/supplier-item.js";
import {
  countsTowardDailyExtractionCap,
  DEFAULT_SUPPLIER_PRICE_LIST_DAILY_EXTRACTION_CAP,
  type SupplierPriceListContentKind,
  type SupplierPriceListReadFailure,
  type SupplierPriceListSourceKind,
  type SupplierPriceListState,
} from "../../model/supplier-price-list.js";
import type {
  FindPriceListSupplierResult,
  FindSupplierPriceListSourceResult,
  LockProductPackagingResult,
  LockSupplierPriceListResult,
  LockSupplierPriceListRowResult,
  NewSupplierItemFields,
  NewSupplierPriceListFields,
  ProposedPriceListRow,
  StoredPriceListRow,
  SupplierItem,
  SupplierItemLink,
  SupplierItemPriceEntry,
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
  fileName: string | null;
  sourceUrl: string | null;
  contentKind: SupplierPriceListContentKind;
  byteSize: number;
  uploadedAt: Date;
  uploadedBy: string;
  state: SupplierPriceListState;
  version: number;
  listDate: string | null;
  pricesIncludeVat: boolean | null;
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
  reviewed: boolean;
}

export interface FakeSupplierItem extends SupplierItem {
  supplierId: string;
}

export interface FakeCatalogProduct {
  id: string;
  active: boolean;
  saleUnit: SaleUnit;
}

export interface FakeCatalogPackaging {
  id: string;
  productId: string;
  active: boolean;
  saleUnit: SaleUnit;
}

export type FakeSupplierPriceListWrite =
  | "insertList"
  | "enqueueReading"
  | "markSent"
  | "recordExtraction"
  | "recordReadFailure"
  | "linkRow"
  | "markRowReviewed"
  | "addSupplierItem"
  | "describeSupplierItem"
  | "rememberSupplierItemLink"
  | "recordSupplierItemPrice"
  | "setRowPrice"
  | "removeRow"
  | "confirmList"
  | "discardList";

export interface FakeSupplierPriceListState {
  suppliers: FakePriceListSupplierRow[];
  lists: FakeSupplierPriceListRow[];
  rows: FakePriceListRow[];
  readingQueue: string[];
  items: FakeSupplierItem[];
  itemPrices: SupplierItemPriceEntry[];
  products: FakeCatalogProduct[];
  packagings: FakeCatalogPackaging[];
  nextId: number;
}

function cloneLink(link: SupplierItemLink | null): SupplierItemLink | null {
  return link === null ? null : { ...link };
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
    rows: state.rows.map((row) => ({ ...row, link: cloneLink(row.link) })),
    readingQueue: [...state.readingQueue],
    items: state.items.map((item) => ({
      ...item,
      key: { ...item.key },
      link: cloneLink(item.link),
    })),
    itemPrices: state.itemPrices.map((entry) => ({ ...entry })),
    products: state.products.map((product) => ({ ...product })),
    packagings: state.packagings.map((packaging) => ({ ...packaging })),
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
      fileName: fields.sourceKind === "PDF" ? fields.fileName : null,
      sourceUrl: fields.sourceKind === "WEB_PAGE" ? fields.sourceUrl : null,
      contentKind: fields.contentKind,
      byteSize: fields.byteSize,
      uploadedAt: fields.uploadedAt,
      uploadedBy: fields.actorId,
      state: "READING",
      version: 1,
      listDate: null,
      pricesIncludeVat: null,
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

  async findListSource(listId: string): Promise<FindSupplierPriceListSourceResult> {
    const list = this.state.lists.find((row) => row.id === listId);
    if (!list) {
      return { kind: "not_found" };
    }
    return {
      kind: "found",
      supplierId: list.supplierId,
      source:
        list.sourceKind === "WEB_PAGE" && list.sourceUrl !== null
          ? { kind: "WEB_PAGE", url: list.sourceUrl }
          : { kind: "PDF" },
    };
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
        supplierId: list.supplierId,
        sourceKind: list.sourceKind,
        contentKind: list.contentKind,
        state: list.state,
        version: list.version,
        listDate: list.listDate,
        pricesIncludeVat: list.pricesIncludeVat,
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
    pricesIncludeVat: boolean | null,
    rows: ProposedPriceListRow[],
  ): Promise<void> {
    this.beforeWrite("recordExtraction");
    const list = this.listRow(listId);
    list.state = "EXTRACTED";
    list.listDate = listDate;
    list.pricesIncludeVat = pricesIncludeVat;
    list.version += 1;
    rows.forEach((row, position) => {
      this.state.rows.push({
        ...row,
        id: `row-${this.state.nextId++}`,
        listId,
        position,
        editedBy: null,
        reviewed: false,
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
    const row = this.state.rows.find((other) => other.id === rowId && other.listId === listId);
    return row
      ? { kind: "locked", row: { description: row.description, code: row.code } }
      : { kind: "not_found" };
  }

  async listRows(listId: string): Promise<StoredPriceListRow[]> {
    return this.state.rows
      .filter((row) => row.listId === listId)
      .sort((a, b) => a.position - b.position)
      .map((row) => ({
        id: row.id,
        description: row.description,
        code: row.code,
        priceCents: row.priceCents,
        link: cloneLink(row.link),
      }));
  }

  async supplierItems(supplierId: string, keys: SupplierItemKey[]): Promise<SupplierItem[]> {
    return this.state.items
      .filter(
        (item) =>
          item.supplierId === supplierId &&
          keys.some((key) => key.kind === item.key.kind && key.value === item.key.value),
      )
      .map(({ supplierId: _supplierId, ...item }) => ({ ...item, link: cloneLink(item.link) }));
  }

  async lockSupplierItems(supplierId: string, keys: SupplierItemKey[]): Promise<SupplierItem[]> {
    this.store.lockCallOrder.push("lockSupplierItems");
    return this.supplierItems(supplierId, keys);
  }

  async lockProductPackaging(
    productId: string,
    packagingId: string,
  ): Promise<LockProductPackagingResult> {
    this.store.lockCallOrder.push("lockProductPackaging");
    const product = this.state.products.find((row) => row.id === productId);
    const packaging = this.state.packagings.find((row) => row.id === packagingId);
    return product && packaging
      ? {
          kind: "locked",
          product: { active: product.active, saleUnit: product.saleUnit },
          packaging: {
            productId: packaging.productId,
            active: packaging.active,
            saleUnit: packaging.saleUnit,
          },
        }
      : { kind: "not_found" };
  }

  async addSupplierItem(fields: NewSupplierItemFields): Promise<{ id: string }> {
    this.beforeWrite("addSupplierItem");
    const id = `item-${this.state.nextId++}`;
    this.state.items.push({
      id,
      supplierId: fields.supplierId,
      key: { ...fields.key },
      description: fields.description,
      link: cloneLink(fields.link),
    });
    return { id };
  }

  async describeSupplierItem(itemId: string, description: string): Promise<void> {
    this.beforeWrite("describeSupplierItem");
    this.itemRow(itemId).description = description;
  }

  async rememberSupplierItemLink(itemId: string, link: SupplierItemLink): Promise<void> {
    this.beforeWrite("rememberSupplierItemLink");
    this.itemRow(itemId).link = cloneLink(link);
  }

  async recordSupplierItemPrice(entry: SupplierItemPriceEntry): Promise<void> {
    this.beforeWrite("recordSupplierItemPrice");
    this.state.itemPrices.push({ ...entry });
  }

  async linkRow(
    listId: string,
    rowId: string,
    link: SupplierItemLink,
    actorId: string,
  ): Promise<void> {
    this.beforeWrite("linkRow");
    for (const row of this.state.rows) {
      if (row.id === rowId && row.listId === listId) {
        row.link = cloneLink(link);
        row.reviewed = true;
        row.editedBy = actorId;
      }
    }
    this.listRow(listId).version += 1;
  }

  async markRowReviewed(listId: string, rowId: string, actorId: string): Promise<void> {
    this.beforeWrite("markRowReviewed");
    for (const row of this.state.rows) {
      if (row.id === rowId && row.listId === listId) {
        row.reviewed = true;
        row.editedBy = actorId;
      }
    }
    this.listRow(listId).version += 1;
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
    pricesIncludeVat: boolean,
    confirmedAt: Date,
    actorId: string,
  ): Promise<void> {
    this.beforeWrite("confirmList");
    const list = this.listRow(listId);
    list.state = "REVIEWED";
    list.listDate = listDate;
    list.pricesIncludeVat = pricesIncludeVat;
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

  private itemRow(itemId: string): FakeSupplierItem {
    const item = this.state.items.find((row) => row.id === itemId);
    if (!item) {
      throw new Error(`no item ${itemId}`);
    }
    return item;
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
    items: [],
    itemPrices: [],
    products: [],
    packagings: [],
    nextId: 1,
  };

  branchCaps = new Map<string, number>();
  failingWrites = new Set<FakeSupplierPriceListWrite>();
  lockCallOrder: string[] = [];
  transactionCount = 0;
  openTransactions = 0;

  seedSupplier(supplier: FakePriceListSupplierRow): void {
    this.state.suppliers.push({ ...supplier });
  }

  deactivateSupplier(supplierId: string): void {
    for (const supplier of this.state.suppliers) {
      if (supplier.id === supplierId) {
        supplier.active = false;
      }
    }
  }

  seedList(list: Partial<FakeSupplierPriceListRow> & { id: string }): void {
    this.state.lists.push({
      locationId: "branch-1",
      supplierId: "supplier-a",
      sourceKind: "PDF",
      fileName: "lista.pdf",
      sourceUrl: null,
      contentKind: "PDF",
      byteSize: 1_000,
      uploadedAt: new Date("2026-03-01T12:00:00Z"),
      uploadedBy: "person-1",
      state: "READING",
      version: 1,
      listDate: null,
      pricesIncludeVat: null,
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
      barcode: null,
      link: null,
      editedBy: null,
      reviewed: false,
      ...row,
    });
  }

  seedSupplierItem(
    item: Partial<FakeSupplierItem> & { description: string; supplierId?: string },
  ): string {
    const id = item.id ?? `item-${this.state.nextId++}`;
    this.state.items.push({
      supplierId: "supplier-a",
      key: supplierItemKey({ code: null, description: item.description }),
      link: null,
      ...item,
      id,
    });
    return id;
  }

  seedProduct(product: Partial<FakeCatalogProduct> & { id: string }): void {
    this.state.products.push({ active: true, saleUnit: "UNIT", ...product });
  }

  seedPackaging(
    packaging: Partial<FakeCatalogPackaging> & { id: string; productId: string },
  ): void {
    this.state.packagings.push({ active: true, saleUnit: "UNIT", ...packaging });
  }

  snapshot(): FakeSupplierPriceListState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: SupplierPriceListStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneState(this.state);
    this.openTransactions += 1;
    try {
      return await work(new FakeSupplierPriceListStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    } finally {
      this.openTransactions -= 1;
    }
  }
}
