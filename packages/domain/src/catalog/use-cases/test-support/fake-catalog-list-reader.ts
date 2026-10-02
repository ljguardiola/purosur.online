import type { ProductActivityScope } from "../../model/product-activity.js";
import type {
  CatalogBrandSummary,
  CatalogListReader,
  CatalogTagSummary,
} from "../catalog-list-reader.js";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogProduct,
  CatalogTag,
} from "../catalog-store.js";

export interface FakeCatalogListData {
  products?: CatalogProduct[];
  categories?: CatalogCategory[];
  brands?: CatalogBrand[];
  tags?: CatalogTag[];
}

function inScope(product: CatalogProduct, scope: ProductActivityScope): boolean {
  switch (scope) {
    case "active":
      return product.active;
    case "inactive":
      return !product.active;
    case "any":
      return true;
  }
}

function byName(first: { name: string }, second: { name: string }): number {
  return first.name.localeCompare(second.name);
}

export class FakeCatalogListReader implements CatalogListReader {
  private readonly data: Required<FakeCatalogListData>;

  constructor(data: FakeCatalogListData = {}) {
    this.data = {
      products: data.products ?? [],
      categories: data.categories ?? [],
      brands: data.brands ?? [],
      tags: data.tags ?? [],
    };
  }

  async products(scope: ProductActivityScope): Promise<CatalogProduct[]> {
    return this.data.products.filter((product) => inScope(product, scope)).sort(byName);
  }

  async product(productId: string): Promise<CatalogProduct | undefined> {
    return this.data.products.find((candidate) => candidate.id === productId);
  }

  async category(categoryId: string): Promise<CatalogCategory | undefined> {
    return this.data.categories.find((candidate) => candidate.id === categoryId);
  }

  async categories(): Promise<CatalogCategory[]> {
    return [...this.data.categories].sort(byName);
  }

  async brands(countedProducts: ProductActivityScope): Promise<CatalogBrandSummary[]> {
    return [...this.data.brands]
      .sort(byName)
      .map((brand) => this.withBrandCount(brand, countedProducts));
  }

  async brand(
    brandId: string,
    countedProducts: ProductActivityScope,
  ): Promise<CatalogBrandSummary | undefined> {
    const brand = this.data.brands.find((candidate) => candidate.id === brandId);
    return brand && this.withBrandCount(brand, countedProducts);
  }

  async tags(countedProducts: ProductActivityScope): Promise<CatalogTagSummary[]> {
    return [...this.data.tags].sort(byName).map((tag) => this.withTagCount(tag, countedProducts));
  }

  async tag(
    tagId: string,
    countedProducts: ProductActivityScope,
  ): Promise<CatalogTagSummary | undefined> {
    const tag = this.data.tags.find((candidate) => candidate.id === tagId);
    return tag && this.withTagCount(tag, countedProducts);
  }

  async taggedProductCount(countedProducts: ProductActivityScope): Promise<number> {
    return this.data.products.filter(
      (product) => inScope(product, countedProducts) && product.tagIds.length > 0,
    ).length;
  }

  private withBrandCount(
    brand: CatalogBrand,
    countedProducts: ProductActivityScope,
  ): CatalogBrandSummary {
    const productCount = this.data.products.filter(
      (product) => product.brandId === brand.id && inScope(product, countedProducts),
    ).length;
    return { ...brand, productCount };
  }

  private withTagCount(tag: CatalogTag, countedProducts: ProductActivityScope): CatalogTagSummary {
    const productCount = this.data.products.filter(
      (product) => product.tagIds.includes(tag.id) && inScope(product, countedProducts),
    ).length;
    return { ...tag, productCount };
  }
}
