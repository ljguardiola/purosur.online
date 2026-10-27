import type { SaleUnit } from "../../catalog/index.js";
import type { SupplierItemKey } from "../model/supplier-item.js";
import type {
  SupplierPriceListContentKind,
  SupplierPriceListReadFailure,
  SupplierPriceListSourceKind,
  SupplierPriceListState,
} from "../model/supplier-price-list.js";

export type NewSupplierPriceListFields = {
  supplierId: string;
  locationId: string;
  contentKind: SupplierPriceListContentKind;
  byteSize: number;
  uploadedAt: Date;
  actorId: string;
} & ({ sourceKind: "PDF"; fileName: string } | { sourceKind: "WEB_PAGE"; sourceUrl: string });

export type FindPriceListSupplierResult =
  | { kind: "not_found" }
  | { kind: "found"; supplier: { id: string; active: boolean } };

export type FindSupplierPriceListSourceResult =
  | { kind: "not_found" }
  | {
      kind: "found";
      supplierId: string;
      source: { kind: "PDF" } | { kind: "WEB_PAGE"; url: string };
    };

// The catalog product and purchase presentation a supplier's item stands for. The rate is in basis
// points and is null for an item whose list prices include VAT.
export interface SupplierItemLink {
  productId: string;
  packagingId: string;
  vatRate: number | null;
}

export interface SupplierItem {
  id: string;
  key: SupplierItemKey;
  description: string;
  link: SupplierItemLink | null;
  // The list date of the item's latest recorded price, null while it has none.
  currentListDate: string | null;
}

export interface NewSupplierItemFields {
  supplierId: string;
  key: SupplierItemKey;
  description: string;
  link: SupplierItemLink | null;
}

export interface SupplierItemPriceEntry {
  itemId: string;
  listId: string;
  priceCents: number;
  listDate: string;
  pricesIncludeVat: boolean;
}

export interface StoredPriceListRow {
  id: string;
  description: string;
  code: string | null;
  priceCents: number | null;
  link: SupplierItemLink | null;
  // Whether a person linked the row in this list, rather than its link being copied when the list
  // was read.
  linkedByPerson: boolean;
}

export type LockProductPackagingResult =
  | { kind: "not_found" }
  | {
      kind: "locked";
      product: { active: boolean; saleUnit: SaleUnit };
      packaging: { productId: string; active: boolean; saleUnit: SaleUnit };
    };

export interface LockedSupplierPriceList {
  id: string;
  supplierId: string;
  sourceKind: SupplierPriceListSourceKind;
  contentKind: SupplierPriceListContentKind;
  state: SupplierPriceListState;
  version: number;
  // The date the reading found, null when it found none.
  listDate: string | null;
  // Whether the list's prices include VAT, null while neither the reading nor a person said.
  pricesIncludeVat: boolean | null;
  // The instant the list was sent to be read, null while it has not been.
  sentAt: Date | null;
  rowPrices: (number | null)[];
}

export type LockSupplierPriceListResult =
  | { kind: "not_found" }
  | { kind: "locked"; list: LockedSupplierPriceList };

export type LockSupplierPriceListRowResult =
  | { kind: "not_found" }
  | { kind: "locked"; row: { description: string; code: string | null } };

export interface ProposedPriceListRow {
  description: string;
  code: string | null;
  presentation: string | null;
  priceCents: number | null;
  page: number | null;
  barcode: string | null;
  // The link remembered for the row's item, copied when the list was read.
  link: SupplierItemLink | null;
}

export interface SupplierPriceListStoreTransaction {
  // Serializes the uploads of one branch and answers the branch's daily cap of extractions,
  // the default one when the branch has set none.
  lockBranchExtractionQuota(locationId: string): Promise<{ cap: number }>;
  // How many extractions count toward the branch's cap on the Argentina calendar day.
  extractionsCountedOn(locationId: string, day: string): Promise<number>;
  findSupplier(supplierId: string): Promise<FindPriceListSupplierResult>;
  findListSource(listId: string): Promise<FindSupplierPriceListSourceResult>;
  insertList(fields: NewSupplierPriceListFields): Promise<{ id: string }>;
  // Queues the background reading of the list within the same transaction that inserted it.
  enqueueReading(listId: string): Promise<void>;
  lockList(listId: string): Promise<LockSupplierPriceListResult>;
  markSent(listId: string, sentAt: Date, sentOn: string): Promise<void>;
  recordExtraction(
    listId: string,
    listDate: string | null,
    pricesIncludeVat: boolean | null,
    rows: ProposedPriceListRow[],
  ): Promise<void>;
  recordReadFailure(listId: string, reason: SupplierPriceListReadFailure): Promise<void>;
  lockRow(listId: string, rowId: string): Promise<LockSupplierPriceListRowResult>;
  // The list's rows in the order the reading found them.
  listRows(listId: string): Promise<StoredPriceListRow[]>;
  // The supplier's remembered items among the keys, those never seen left out.
  supplierItems(supplierId: string, keys: SupplierItemKey[]): Promise<SupplierItem[]>;
  // Like supplierItems, and serializes the writers of the supplier's items, those not yet
  // remembered included.
  lockSupplierItems(supplierId: string, keys: SupplierItemKey[]): Promise<SupplierItem[]>;
  lockProductPackaging(productId: string, packagingId: string): Promise<LockProductPackagingResult>;
  addSupplierItem(fields: NewSupplierItemFields): Promise<{ id: string }>;
  describeSupplierItem(itemId: string, description: string): Promise<void>;
  rememberSupplierItemLink(itemId: string, link: SupplierItemLink): Promise<void>;
  // Appends to the item's price history, which keeps one entry per confirmed list.
  recordSupplierItemPrice(entry: SupplierItemPriceEntry): Promise<void>;
  // Every change of the review advances the list's version.
  linkRow(listId: string, rowId: string, link: SupplierItemLink, actorId: string): Promise<void>;
  markRowReviewed(listId: string, rowId: string, actorId: string): Promise<void>;
  setRowPrice(listId: string, rowId: string, priceCents: number, actorId: string): Promise<void>;
  removeRow(listId: string, rowId: string, actorId: string): Promise<void>;
  confirmList(
    listId: string,
    listDate: string,
    pricesIncludeVat: boolean,
    confirmedAt: Date,
    actorId: string,
  ): Promise<void>;
  discardList(listId: string, discardedAt: Date, actorId: string): Promise<void>;
}

export interface SupplierPriceListStore {
  transaction<TOutcome>(
    work: (tx: SupplierPriceListStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
