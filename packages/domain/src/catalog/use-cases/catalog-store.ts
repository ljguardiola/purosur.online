import type { Clock } from "../../shared/index.js";
import type { NetContentUnit, SaleUnit } from "../model/product.js";

export interface CatalogNetContent {
  quantity: number;
  unit: NetContentUnit;
}

export interface CatalogProduct {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  brandId: string | null;
  saleUnit: SaleUnit;
  barcodes: string[];
  tagIds: string[];
  netContent: CatalogNetContent | null;
  active: boolean;
  version: number;
}

export interface CatalogBrand {
  id: string;
  name: string;
  active: boolean;
  version: number;
}

export interface CatalogTag {
  id: string;
  name: string;
  active: boolean;
  version: number;
}

export interface CatalogCategory {
  id: string;
  name: string;
  parentId: string | null;
  version: number;
}

// Thrown by a write that loses a product's active-barcode uniqueness to a concurrent create or edit.
export class CatalogBarcodeConflict extends Error {}

// Thrown by a write that races a category's per-parent name uniqueness.
export class CatalogCategoryNameConflict extends Error {}

// Thrown by a write that races the brand name uniqueness.
export class CatalogBrandNameConflict extends Error {}

// Thrown by a write that races the tag name uniqueness.
export class CatalogTagNameConflict extends Error {}

export type LockLeafCategoryResult =
  | { kind: "not_found" }
  | { kind: "not_leaf" }
  | { kind: "locked"; category: { id: string; name: string } };

export type LockParentForNewChildResult =
  | { kind: "not_found" }
  | { kind: "has_products" }
  | { kind: "locked" };

export interface LockedProduct {
  id: string;
  version: number;
  active: boolean;
  brandId: string | null;
  saleUnit: SaleUnit;
  tagIds: string[];
  barcodes: string[];
}

export interface BuyNPayMDiscount {
  name: string;
  active: boolean;
  validFrom: string;
  validTo: string;
}

export type LockProductResult = { kind: "not_found" } | { kind: "locked"; product: LockedProduct };

export type LockCategoryResult =
  | { kind: "not_found" }
  | {
      kind: "locked";
      category: { id: string; name: string; parentId: string | null; version: number };
    };

export type LockBrandResult =
  | { kind: "not_found" }
  | { kind: "locked"; brand: { id: string; name: string; active: boolean; version: number } };

export type LockTagResult =
  | { kind: "not_found" }
  | { kind: "locked"; tag: { id: string; name: string; active: boolean; version: number } };

export interface TagFields {
  name: string;
  active: boolean;
  version: number;
}

export interface BrandFields {
  name: string;
  active: boolean;
  version: number;
}

export interface NewProductFields {
  name: string;
  categoryId: string;
  brandId: string | null;
  saleUnit: SaleUnit;
  netContent: CatalogNetContent | null;
}

export interface ProductFields {
  name: string;
  categoryId: string;
  brandId: string | null;
  saleUnit: SaleUnit;
  netContent: CatalogNetContent | null;
  version: number;
}

export interface CategoryFields {
  name: string;
  parentId: string | null;
  version: number;
}

export interface CatalogPorts {
  store: CatalogStore;
  clock: Clock;
}

export interface CatalogStoreTransaction {
  lockLeafCategory(categoryId: string): Promise<LockLeafCategoryResult>;
  lockParentForNewChild(parentId: string): Promise<LockParentForNewChildResult>;
  lockProduct(productId: string): Promise<LockProductResult>;
  // Read only, never locking: a caller holds the product's row lock first, and the discount
  // creation that could race it takes that same product row before inserting.
  buyNPayMDiscountsOn(productId: string): Promise<BuyNPayMDiscount[]>;
  lockCategory(categoryId: string): Promise<LockCategoryResult>;
  // Acquired before any row lock, so two concurrent moves can never each hold their own row lock
  // and deadlock trying to lock each other's row as the new parent.
  lockCategoryTreeForMove(): Promise<void>;
  parentIdOf(categoryId: string): Promise<string | null>;
  siblingNameTaken(
    parentId: string | null,
    name: string,
    excludingCategoryId?: string,
  ): Promise<boolean>;
  // Only an active barcode counts as taken; a deactivated product's barcode is free to reuse.
  activeBarcodesTaken(codes: readonly string[], excludingProductId?: string): Promise<string[]>;
  insertProduct(fields: NewProductFields): Promise<{ id: string }>;
  insertProductBarcodes(productId: string, barcodes: readonly string[]): Promise<void>;
  updateProduct(productId: string, fields: ProductFields): Promise<void>;
  insertProductTags(productId: string, tagIds: readonly string[]): Promise<void>;
  replaceProductTags(productId: string, tagIds: readonly string[]): Promise<void>;
  // Takes the product this transaction locked, since its barcodes follow its active state.
  replaceProductBarcodes(product: LockedProduct, barcodes: readonly string[]): Promise<void>;
  deactivateProduct(productId: string, nextVersion: number): Promise<void>;
  deactivateProductBarcodes(productId: string): Promise<void>;
  insertCategory(name: string, parentId: string | null): Promise<{ id: string }>;
  updateCategory(categoryId: string, fields: CategoryFields): Promise<void>;
  lockBrand(brandId: string): Promise<LockBrandResult>;
  // Every brand counts, deactivated ones included, and letter case is ignored.
  brandNameTaken(name: string, excludingBrandId?: string): Promise<boolean>;
  insertBrand(name: string): Promise<{ id: string }>;
  updateBrand(brandId: string, fields: BrandFields): Promise<void>;
  lockTag(tagId: string): Promise<LockTagResult>;
  // Every tag counts, deactivated ones included, and letter case is ignored.
  tagNameTaken(name: string, excludingTagId?: string): Promise<boolean>;
  insertTag(name: string): Promise<{ id: string }>;
  updateTag(tagId: string, fields: TagFields): Promise<void>;
}

export interface CatalogStore {
  transaction<TOutcome>(
    work: (tx: CatalogStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
  // Reads outside any transaction: used after a transaction rolled back to find which of this
  // request's codes are now taken, which the violation that rolled it back doesn't say on its own.
  activeBarcodesTaken(codes: readonly string[], excludingProductId?: string): Promise<string[]>;
}
