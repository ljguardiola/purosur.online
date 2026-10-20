import type {
  SupplierPriceListReadFailure,
  SupplierPriceListSourceKind,
  SupplierPriceListState,
} from "../model/supplier-price-list.js";

export interface NewSupplierPriceListFields {
  supplierId: string;
  locationId: string;
  sourceKind: "PDF";
  fileName: string;
  byteSize: number;
  uploadedAt: Date;
  actorId: string;
}

export type FindPriceListSupplierResult =
  | { kind: "not_found" }
  | { kind: "found"; supplier: { id: string; active: boolean } };

export interface LockedSupplierPriceList {
  id: string;
  sourceKind: SupplierPriceListSourceKind;
  state: SupplierPriceListState;
  version: number;
  // The date the reading found, null when it found none.
  listDate: string | null;
  // The instant the list was sent to the AI service, null while it has not been.
  sentAt: Date | null;
  rowPrices: (number | null)[];
}

export type LockSupplierPriceListResult =
  | { kind: "not_found" }
  | { kind: "locked"; list: LockedSupplierPriceList };

export type LockSupplierPriceListRowResult = { kind: "not_found" } | { kind: "locked" };

export interface ProposedPriceListRow {
  description: string;
  code: string | null;
  presentation: string | null;
  priceCents: number | null;
  page: number | null;
}

export interface SupplierPriceListStoreTransaction {
  // Serializes the uploads of one branch and answers the branch's daily cap of extractions,
  // the default one when the branch has set none.
  lockBranchExtractionQuota(locationId: string): Promise<{ cap: number }>;
  // How many extractions count toward the branch's cap on the Argentina calendar day.
  extractionsCountedOn(locationId: string, day: string): Promise<number>;
  findSupplier(supplierId: string): Promise<FindPriceListSupplierResult>;
  insertList(fields: NewSupplierPriceListFields): Promise<{ id: string }>;
  // Queues the background reading of the list within the same transaction that inserted it.
  enqueueReading(listId: string): Promise<void>;
  lockList(listId: string): Promise<LockSupplierPriceListResult>;
  markSent(listId: string, sentAt: Date, sentOn: string): Promise<void>;
  recordExtraction(
    listId: string,
    listDate: string | null,
    rows: ProposedPriceListRow[],
  ): Promise<void>;
  recordReadFailure(listId: string, reason: SupplierPriceListReadFailure): Promise<void>;
  lockRow(listId: string, rowId: string): Promise<LockSupplierPriceListRowResult>;
  // Every change of the review advances the list's version.
  setRowPrice(listId: string, rowId: string, priceCents: number, actorId: string): Promise<void>;
  removeRow(listId: string, rowId: string, actorId: string): Promise<void>;
  confirmList(listId: string, listDate: string, confirmedAt: Date, actorId: string): Promise<void>;
  discardList(listId: string, discardedAt: Date, actorId: string): Promise<void>;
}

export interface SupplierPriceListStore {
  transaction<TOutcome>(
    work: (tx: SupplierPriceListStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
