import type { PackagingListing, PurchasingListReader } from "../purchasing-list-reader.js";
import type { Packaging, Supplier } from "../purchasing-store.js";
import type { FakeProductRow } from "./fake-purchasing-store.js";

export interface FakePurchasingListData {
  suppliers?: Supplier[];
  packagings?: Packaging[];
  products?: FakeProductRow[];
}

function byName(first: { name: string }, second: { name: string }): number {
  return first.name.localeCompare(second.name);
}

export class FakePurchasingListReader implements PurchasingListReader {
  private readonly data: Required<FakePurchasingListData>;

  constructor(data: FakePurchasingListData = {}) {
    this.data = {
      suppliers: data.suppliers ?? [],
      packagings: data.packagings ?? [],
      products: data.products ?? [],
    };
  }

  async suppliers(): Promise<Supplier[]> {
    return [...this.data.suppliers].sort(byName);
  }

  async packagings(): Promise<PackagingListing[]> {
    return this.data.packagings.sort(byName).flatMap((packaging) => {
      const product = this.data.products.find((row) => row.id === packaging.productId);
      return product
        ? [{ ...packaging, productName: product.name, productSaleUnit: product.saleUnit }]
        : [];
    });
  }

  async packaging(packagingId: string): Promise<PackagingListing | undefined> {
    return (await this.packagings()).find((packaging) => packaging.id === packagingId);
  }
}
