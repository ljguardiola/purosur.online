import type { SupplierPriceListContentKind } from "../model/supplier-price-list.js";

export interface StoredSupplierPriceListFile {
  bytes: Uint8Array;
  contentKind: SupplierPriceListContentKind;
}

export interface SupplierPriceListFiles {
  store(
    listId: string,
    bytes: Uint8Array,
    contentKind: SupplierPriceListContentKind,
  ): Promise<void>;
  // Null when no file is kept for the list.
  read(listId: string): Promise<StoredSupplierPriceListFile | null>;
}
