import type { ProductActivityScope } from "../model/product-activity.js";
import type { CatalogBrand, CatalogCategory, CatalogProduct, CatalogTag } from "./catalog-store.js";

export interface CatalogBrandSummary extends CatalogBrand {
  productCount: number;
}

export interface CatalogTagSummary extends CatalogTag {
  productCount: number;
}

export interface CatalogListReader {
  products(scope: ProductActivityScope): Promise<CatalogProduct[]>;
  product(productId: string): Promise<CatalogProduct | undefined>;
  categories(): Promise<CatalogCategory[]>;
  category(categoryId: string): Promise<CatalogCategory | undefined>;
  brands(countedProducts: ProductActivityScope): Promise<CatalogBrandSummary[]>;
  brand(
    brandId: string,
    countedProducts: ProductActivityScope,
  ): Promise<CatalogBrandSummary | undefined>;
  tags(countedProducts: ProductActivityScope): Promise<CatalogTagSummary[]>;
  tag(tagId: string, countedProducts: ProductActivityScope): Promise<CatalogTagSummary | undefined>;
  taggedProductCount(countedProducts: ProductActivityScope): Promise<number>;
}
