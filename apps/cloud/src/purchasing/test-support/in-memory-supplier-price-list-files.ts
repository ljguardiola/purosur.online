import type {
  StoredSupplierPriceListFile,
  SupplierPriceListFiles,
} from "@purosur/domain/purchasing/use-cases";

export class InMemorySupplierPriceListFiles implements SupplierPriceListFiles {
  readonly stored = new Map<string, StoredSupplierPriceListFile>();

  async store(
    listId: string,
    bytes: Uint8Array,
    contentKind: StoredSupplierPriceListFile["contentKind"],
  ): Promise<void> {
    this.stored.set(listId, { bytes, contentKind });
  }

  async read(listId: string): Promise<StoredSupplierPriceListFile | null> {
    return this.stored.get(listId) ?? null;
  }
}
