import type { ProductBrandAndNetContent, SaleUnit } from "../../catalog/index.js";
import type {
  SupplierPriceListReadFailure,
  SupplierPriceListState,
} from "../model/supplier-price-list.js";

export type SupplierPriceListSource =
  | { kind: "PDF"; fileName: string }
  | { kind: "WEB_PAGE"; url: string };

export interface SupplierPriceListListing {
  id: string;
  supplier: { id: string; name: string };
  source: SupplierPriceListSource;
  listDate: string | null;
  rowCount: number;
  unpricedRowCount: number;
  state: SupplierPriceListState;
  readFailure: SupplierPriceListReadFailure | null;
  // Whether the list's page is being read again.
  rereading: boolean;
  // Why the list's latest requested reread failed; null when that reread was read or is being
  // read, and when the list has had none.
  lastRereadFailure: SupplierPriceListReadFailure | null;
  uploadedAt: Date;
  // Null until a person confirms the list.
  confirmedAt: Date | null;
}

export interface SupplierPriceListReviewRowLink {
  product: ProductBrandAndNetContent & { id: string; name: string; saleUnit: SaleUnit };
  quantity: number;
  saleUnit: SaleUnit;
  relinkRequired: boolean;
  // In basis points, null for an item whose list prices include VAT.
  vatRate: number | null;
}

export interface SupplierPriceListReviewRow {
  id: string;
  description: string;
  code: string | null;
  presentation: string | null;
  priceCents: number | null;
  page: number | null;
  barcode: string | null;
  link: SupplierPriceListReviewRowLink | null;
  // Whether a person linked the row or marked it reviewed in this list.
  reviewed: boolean;
  // Whether another of the supplier's confirmed lists recorded the row's item.
  remembered: boolean;
  // The item's description and the price of its latest confirmed list before this one, null when
  // none came before it.
  earlier: { description: string; priceCents: number } | null;
}

export interface SupplierPriceListReview {
  list: SupplierPriceListListing & {
    version: number;
    // Whether the list's prices include VAT, null while neither the reading nor a person said.
    pricesIncludeVat: boolean | null;
  };
  rows: SupplierPriceListReviewRow[];
}

export interface SupplierPriceListReader {
  // Every list, most recently uploaded first.
  lists(): Promise<SupplierPriceListListing[]>;
  // The rows in the order the reading found them.
  review(listId: string): Promise<SupplierPriceListReview | undefined>;
  // Undefined for a list that did not come from an uploaded file.
  fileName(listId: string): Promise<string | undefined>;
}
