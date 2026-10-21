export interface SupplierPriceListFiles {
  store(listId: string, bytes: Uint8Array): Promise<void>;
  // Null when no file is kept for the list.
  read(listId: string): Promise<Uint8Array | null>;
}
