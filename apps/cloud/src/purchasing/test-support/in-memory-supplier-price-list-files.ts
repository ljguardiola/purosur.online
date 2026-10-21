import type { SupplierPriceListFiles } from "@purosur/domain/purchasing/use-cases";

export class InMemorySupplierPriceListFiles implements SupplierPriceListFiles {
  readonly stored = new Map<string, Uint8Array>();

  async store(listId: string, bytes: Uint8Array): Promise<void> {
    this.stored.set(listId, bytes);
  }

  async read(listId: string): Promise<Uint8Array | null> {
    return this.stored.get(listId) ?? null;
  }
}
