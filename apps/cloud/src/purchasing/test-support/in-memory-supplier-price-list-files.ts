import type { SupplierPriceListContentKind } from "@purosur/domain";
import type { SupplierPriceListFiles } from "@purosur/domain/purchasing/use-cases";

export class InMemorySupplierPriceListFiles implements SupplierPriceListFiles {
  readonly stored = new Map<
    string,
    { bytes: Uint8Array; contentKind: SupplierPriceListContentKind }
  >();

  async store(
    listId: string,
    bytes: Uint8Array,
    contentKind: SupplierPriceListContentKind,
  ): Promise<void> {
    this.stored.set(listId, { bytes, contentKind });
  }

  async read(
    listId: string,
    contentKind: SupplierPriceListContentKind,
  ): Promise<Uint8Array | null> {
    const file = this.stored.get(listId);
    return file?.contentKind === contentKind ? file.bytes : null;
  }
}
