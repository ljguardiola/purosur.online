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
  saleUnit: SaleUnit;
  barcodes: string[];
  netContent: CatalogNetContent | null;
  active: boolean;
  version: number;
}

export interface CatalogCategory {
  id: string;
  name: string;
  parentId: string | null;
  version: number;
}

// Thrown by a write that races a product's active-barcode uniqueness (a concurrent create or edit
// landed first); the use case re-reads the taken codes from the store once this has rolled back.
export class CatalogBarcodeConflict extends Error {}

// Thrown by a write that races a category's per-parent name uniqueness.
export class CatalogCategoryNameConflict extends Error {}

export type LockLeafCategoryResult =
  | { kind: "not_found" }
  | { kind: "not_leaf" }
  | { kind: "locked"; category: { id: string; name: string } };

export type LockParentForNewChildResult =
  | { kind: "not_found" }
  | { kind: "has_products" }
  | { kind: "locked" };

export type LockProductResult =
  | { kind: "not_found" }
  | { kind: "locked"; product: { version: number; active: boolean } };

export type LockCategoryResult =
  | { kind: "not_found" }
  | { kind: "locked"; category: { name: string; parentId: string | null; version: number } };

export interface NewProductFields {
  name: string;
  categoryId: string;
  saleUnit: SaleUnit;
  netContent: CatalogNetContent | null;
}

export interface ProductFields {
  name: string;
  categoryId: string;
  saleUnit: SaleUnit;
  netContent: CatalogNetContent | null;
  version: number;
}

export interface CategoryFields {
  name: string;
  parentId: string | null;
  version: number;
}

// A transaction-scoped handle: every write an operation makes goes through the same one, so the
// adapter can commit or roll every one of them back together.
export interface CatalogStoreTransaction {
  lockLeafCategory(categoryId: string): Promise<LockLeafCategoryResult>;
  lockParentForNewChild(parentId: string): Promise<LockParentForNewChildResult>;
  lockProductForUpdate(productId: string): Promise<LockProductResult>;
  lockCategoryForUpdate(categoryId: string): Promise<LockCategoryResult>;
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
  replaceProductBarcodes(
    productId: string,
    barcodes: readonly string[],
    active: boolean,
  ): Promise<void>;
  deactivateProduct(productId: string, nextVersion: number): Promise<void>;
  deactivateProductBarcodes(productId: string): Promise<void>;
  insertCategory(name: string, parentId: string | null): Promise<{ id: string }>;
  updateCategory(categoryId: string, fields: CategoryFields): Promise<void>;
}

export interface CatalogStore {
  transaction<TOutcome>(
    work: (tx: CatalogStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
  // Reads outside any transaction: used after a transaction rolled back to find which of this
  // request's codes are now taken, which the violation that rolled it back doesn't say on its own.
  activeBarcodesTaken(codes: readonly string[], excludingProductId?: string): Promise<string[]>;
}
