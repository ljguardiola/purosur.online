import type { SupplierPriceListContentKind } from "../../model/supplier-price-list.js";
import type { SupplierPriceListFiles } from "../supplier-price-list-files.js";

export class FakeSupplierPriceListFiles implements SupplierPriceListFiles {
  readonly stored = new Map<string, Uint8Array>();
  readonly contentKinds = new Map<string, SupplierPriceListContentKind>();
  readonly reads: { listId: string; contentKind: SupplierPriceListContentKind }[] = [];
  storeFails = false;
  onRead: () => Promise<void> = async () => undefined;

  async store(
    listId: string,
    bytes: Uint8Array,
    contentKind: SupplierPriceListContentKind,
  ): Promise<void> {
    if (this.storeFails) {
      throw new Error("store failed");
    }
    this.stored.set(listId, bytes);
    this.contentKinds.set(listId, contentKind);
  }

  async read(
    listId: string,
    contentKind: SupplierPriceListContentKind,
  ): Promise<Uint8Array | null> {
    this.reads.push({ listId, contentKind });
    await this.onRead();
    const bytes = this.stored.get(listId);
    return bytes !== undefined && (this.contentKinds.get(listId) ?? "PDF") === contentKind
      ? bytes
      : null;
  }
}
