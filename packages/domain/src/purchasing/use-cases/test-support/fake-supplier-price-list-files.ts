import type { SupplierPriceListFiles } from "../supplier-price-list-files.js";

export class FakeSupplierPriceListFiles implements SupplierPriceListFiles {
  readonly stored = new Map<string, Uint8Array>();
  storeFails = false;

  async store(listId: string, bytes: Uint8Array): Promise<void> {
    if (this.storeFails) {
      throw new Error("store failed");
    }
    this.stored.set(listId, bytes);
  }

  async read(listId: string): Promise<Uint8Array | null> {
    return this.stored.get(listId) ?? null;
  }
}
