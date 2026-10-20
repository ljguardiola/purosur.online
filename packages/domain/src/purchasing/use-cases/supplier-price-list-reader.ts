import type {
  SupplierPriceListReadFailure,
  SupplierPriceListSourceKind,
  SupplierPriceListState,
} from "../model/supplier-price-list.js";

export interface SupplierPriceListListing {
  id: string;
  supplier: { id: string; name: string };
  sourceKind: SupplierPriceListSourceKind;
  fileName: string;
  listDate: string | null;
  rowCount: number;
  unpricedRowCount: number;
  state: SupplierPriceListState;
  readFailure: SupplierPriceListReadFailure | null;
  uploadedAt: Date;
  // Null until a person confirms the list.
  confirmedAt: Date | null;
}

export interface SupplierPriceListReviewRow {
  id: string;
  description: string;
  code: string | null;
  presentation: string | null;
  priceCents: number | null;
  page: number | null;
}

export interface SupplierPriceListReview {
  list: SupplierPriceListListing & { version: number };
  rows: SupplierPriceListReviewRow[];
}

export interface SupplierPriceListReader {
  // Every list, most recently uploaded first.
  lists(): Promise<SupplierPriceListListing[]>;
  // The rows in the order the reading found them.
  review(listId: string): Promise<SupplierPriceListReview | undefined>;
  fileName(listId: string): Promise<string | undefined>;
}
