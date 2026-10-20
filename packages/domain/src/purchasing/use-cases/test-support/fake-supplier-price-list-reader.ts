import type {
  SupplierPriceListListing,
  SupplierPriceListReader,
  SupplierPriceListReview,
  SupplierPriceListReviewRow,
} from "../supplier-price-list-reader.js";

export interface FakeSupplierPriceListData {
  lists?: (SupplierPriceListListing & { version?: number })[];
  rows?: (SupplierPriceListReviewRow & { listId: string })[];
}

export class FakeSupplierPriceListReader implements SupplierPriceListReader {
  private readonly data: Required<FakeSupplierPriceListData>;

  constructor(data: FakeSupplierPriceListData = {}) {
    this.data = { lists: data.lists ?? [], rows: data.rows ?? [] };
  }

  async lists(): Promise<SupplierPriceListListing[]> {
    return this.data.lists
      .map(({ version: _version, ...listing }) => listing)
      .sort((first, second) => second.uploadedAt.getTime() - first.uploadedAt.getTime());
  }

  async review(listId: string): Promise<SupplierPriceListReview | undefined> {
    const found = this.data.lists.find((row) => row.id === listId);
    if (!found) {
      return undefined;
    }
    const { version, ...list } = found;
    return {
      list: { ...list, version: version ?? 1 },
      rows: this.data.rows
        .filter((row) => row.listId === listId)
        .map(({ listId: _listId, ...row }) => row),
    };
  }

  async fileName(listId: string): Promise<string | undefined> {
    return this.data.lists.find((row) => row.id === listId)?.fileName;
  }
}
