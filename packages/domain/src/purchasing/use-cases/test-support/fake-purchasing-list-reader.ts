import type { ProductActivityScope } from "../../../catalog/index.js";
import type {
  PackageableProduct,
  PackagingListing,
  PurchasingListReader,
} from "../purchasing-list-reader.js";
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

function inScope(product: FakeProductRow, scope: ProductActivityScope): boolean {
  switch (scope) {
    case "active":
      return product.active;
    case "inactive":
      return !product.active;
    case "any":
      return true;
  }
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
        ? [{ ...packaging, productName: product.name, saleUnit: product.saleUnit }]
        : [];
    });
  }

  async products(scope: ProductActivityScope): Promise<PackageableProduct[]> {
    return this.data.products
      .filter((product) => inScope(product, scope))
      .sort(byName)
      .map(({ id, name, saleUnit }) => ({ id, name, saleUnit }));
  }
}
