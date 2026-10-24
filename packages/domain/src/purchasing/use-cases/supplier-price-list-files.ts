import type { SupplierPriceListContentKind } from "../model/supplier-price-list.js";

export interface SupplierPriceListFiles {
  store(
    listId: string,
    bytes: Uint8Array,
    contentKind: SupplierPriceListContentKind,
  ): Promise<void>;
  // Null when no file of that kind is kept for the list.
  read(listId: string, contentKind: SupplierPriceListContentKind): Promise<Uint8Array | null>;
}
