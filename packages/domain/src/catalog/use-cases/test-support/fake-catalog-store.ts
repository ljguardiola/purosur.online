import type {
  BrandFields,
  CatalogNetContent,
  CatalogStore,
  CatalogStoreTransaction,
  CategoryFields,
  LockBrandResult,
  LockCategoryResult,
  LockedProduct,
  LockLeafCategoryResult,
  LockParentForNewChildResult,
  LockProductResult,
  LockTagResult,
  NewProductFields,
  ProductFields,
  TagFields,
} from "../catalog-store.js";
import {
  CatalogBarcodeConflict,
  CatalogBrandNameConflict,
  CatalogCategoryNameConflict,
  CatalogTagNameConflict,
} from "../catalog-store.js";

export interface FakeCategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  version: number;
}

export interface FakeBrandRow {
  id: string;
  name: string;
  active: boolean;
  version: number;
}

export interface FakeTagRow {
  id: string;
  name: string;
  active: boolean;
  version: number;
}

export interface FakeProductRow {
  id: string;
  name: string;
  categoryId: string;
  brandId: string | null;
  saleUnit: string;
  netContent: CatalogNetContent | null;
  active: boolean;
  version: number;
}

interface FakeBarcodeRow {
  productId: string;
  code: string;
  active: boolean;
}

interface FakeProductTagRow {
  productId: string;
  tagId: string;
}

export interface FakeCatalogState {
  brands: FakeBrandRow[];
  tags: FakeTagRow[];
  categories: FakeCategoryRow[];
  products: FakeProductRow[];
  barcodes: FakeBarcodeRow[];
  productTags: FakeProductTagRow[];
  nextId: number;
}

function emptyState(): FakeCatalogState {
  return {
    brands: [],
    tags: [],
    categories: [],
    products: [],
    barcodes: [],
    productTags: [],
    nextId: 1,
  };
}

function cloneState(state: FakeCatalogState): FakeCatalogState {
  return {
    brands: state.brands.map((row) => ({ ...row })),
    tags: state.tags.map((row) => ({ ...row })),
    categories: state.categories.map((row) => ({ ...row })),
    products: state.products.map((row) => ({
      ...row,
      netContent: row.netContent ? { ...row.netContent } : null,
    })),
    barcodes: state.barcodes.map((row) => ({ ...row })),
    productTags: state.productTags.map((row) => ({ ...row })),
    nextId: state.nextId,
  };
}

function activeBarcodesTaken(
  state: FakeCatalogState,
  codes: readonly string[],
  excludingProductId: string | undefined,
): string[] {
  return state.barcodes
    .filter((row) => row.active && codes.includes(row.code) && row.productId !== excludingProductId)
    .map((row) => row.code);
}

class FakeCatalogStoreTransaction implements CatalogStoreTransaction {
  private readonly state: FakeCatalogState;
  private readonly store: FakeCatalogStore;

  constructor(state: FakeCatalogState, store: FakeCatalogStore) {
    this.state = state;
    this.store = store;
  }

  async lockLeafCategory(categoryId: string): Promise<LockLeafCategoryResult> {
    this.store.lockCallOrder.push("lockLeafCategory");
    const category = this.state.categories.find((row) => row.id === categoryId);
    if (!category) {
      return { kind: "not_found" };
    }
    const hasChild = this.state.categories.some((row) => row.parentId === categoryId);
    return hasChild
      ? { kind: "not_leaf" }
      : { kind: "locked", category: { id: category.id, name: category.name } };
  }

  async lockParentForNewChild(parentId: string): Promise<LockParentForNewChildResult> {
    this.store.lockCallOrder.push("lockParentForNewChild");
    const parent = this.state.categories.find((row) => row.id === parentId);
    if (!parent) {
      return { kind: "not_found" };
    }
    const hasProduct = this.state.products.some((row) => row.categoryId === parentId);
    return hasProduct ? { kind: "has_products" } : { kind: "locked" };
  }

  async lockProduct(productId: string): Promise<LockProductResult> {
    this.store.lockCallOrder.push("lockProduct");
    const product = this.state.products.find((row) => row.id === productId);
    return product
      ? {
          kind: "locked",
          product: {
            id: product.id,
            version: product.version,
            active: product.active,
            brandId: product.brandId,
            tagIds: this.state.productTags
              .filter((row) => row.productId === product.id)
              .map((row) => row.tagId),
          },
        }
      : { kind: "not_found" };
  }

  async lockCategory(categoryId: string): Promise<LockCategoryResult> {
    this.store.lockCallOrder.push("lockCategory");
    const category = this.state.categories.find((row) => row.id === categoryId);
    return category
      ? {
          kind: "locked",
          category: { name: category.name, parentId: category.parentId, version: category.version },
        }
      : { kind: "not_found" };
  }

  async lockCategoryTreeForMove(): Promise<void> {
    this.store.lockCallOrder.push("lockCategoryTreeForMove");
  }

  async parentIdOf(categoryId: string): Promise<string | null> {
    const category = this.state.categories.find((row) => row.id === categoryId);
    return category?.parentId ?? null;
  }

  async siblingNameTaken(
    parentId: string | null,
    name: string,
    excludingCategoryId?: string,
  ): Promise<boolean> {
    return this.state.categories.some(
      (row) =>
        row.parentId === parentId &&
        row.name.toLowerCase() === name.toLowerCase() &&
        row.id !== excludingCategoryId,
    );
  }

  async activeBarcodesTaken(
    codes: readonly string[],
    excludingProductId?: string,
  ): Promise<string[]> {
    return activeBarcodesTaken(this.state, codes, excludingProductId);
  }

  async insertProduct(fields: NewProductFields): Promise<{ id: string }> {
    const id = `product-${this.state.nextId++}`;
    this.state.products.push({
      id,
      name: fields.name,
      categoryId: fields.categoryId,
      brandId: fields.brandId,
      saleUnit: fields.saleUnit,
      netContent: fields.netContent,
      active: true,
      version: 1,
    });
    return { id };
  }

  async insertProductBarcodes(productId: string, barcodes: readonly string[]): Promise<void> {
    for (const code of barcodes) {
      if (this.store.barcodeConflicts.has(code)) {
        throw new CatalogBarcodeConflict();
      }
      this.state.barcodes.push({ productId, code, active: true });
    }
  }

  async updateProduct(productId: string, fields: ProductFields): Promise<void> {
    for (const product of this.state.products) {
      if (product.id === productId) {
        product.name = fields.name;
        product.categoryId = fields.categoryId;
        product.brandId = fields.brandId;
        product.saleUnit = fields.saleUnit;
        product.netContent = fields.netContent;
        product.version = fields.version;
      }
    }
  }

  async insertProductTags(productId: string, tagIds: readonly string[]): Promise<void> {
    for (const tagId of tagIds) {
      this.state.productTags.push({ productId, tagId });
    }
  }

  async replaceProductTags(productId: string, tagIds: readonly string[]): Promise<void> {
    this.state.productTags = this.state.productTags.filter((row) => row.productId !== productId);
    await this.insertProductTags(productId, tagIds);
  }

  async replaceProductBarcodes(product: LockedProduct, barcodes: readonly string[]): Promise<void> {
    this.store.barcodeReplacements.push({ product: { ...product }, barcodes: [...barcodes] });
    this.state.barcodes = this.state.barcodes.filter((row) => row.productId !== product.id);
    for (const code of barcodes) {
      if (this.store.barcodeConflicts.has(code)) {
        throw new CatalogBarcodeConflict();
      }
      this.state.barcodes.push({ productId: product.id, code, active: product.active });
    }
  }

  async deactivateProduct(productId: string, nextVersion: number): Promise<void> {
    for (const product of this.state.products) {
      if (product.id === productId) {
        product.active = false;
        product.version = nextVersion;
      }
    }
  }

  async deactivateProductBarcodes(productId: string): Promise<void> {
    for (const row of this.state.barcodes) {
      if (row.productId === productId) {
        row.active = false;
      }
    }
  }

  async insertCategory(name: string, parentId: string | null): Promise<{ id: string }> {
    if (this.store.categoryNameConflicts.has(name.toLowerCase())) {
      throw new CatalogCategoryNameConflict();
    }
    const id = `category-${this.state.nextId++}`;
    this.state.categories.push({ id, name, parentId, version: 1 });
    return { id };
  }

  async updateCategory(categoryId: string, fields: CategoryFields): Promise<void> {
    if (this.store.categoryNameConflicts.has(fields.name.toLowerCase())) {
      throw new CatalogCategoryNameConflict();
    }
    for (const category of this.state.categories) {
      if (category.id === categoryId) {
        category.name = fields.name;
        category.parentId = fields.parentId;
        category.version = fields.version;
      }
    }
  }

  async lockBrand(brandId: string): Promise<LockBrandResult> {
    this.store.lockCallOrder.push("lockBrand");
    const brand = this.state.brands.find((row) => row.id === brandId);
    return brand
      ? {
          kind: "locked",
          brand: { name: brand.name, active: brand.active, version: brand.version },
        }
      : { kind: "not_found" };
  }

  async brandNameTaken(name: string, excludingBrandId?: string): Promise<boolean> {
    return this.state.brands.some(
      (row) => row.name.toLowerCase() === name.toLowerCase() && row.id !== excludingBrandId,
    );
  }

  async insertBrand(name: string): Promise<{ id: string }> {
    if (this.store.brandNameConflicts.has(name.toLowerCase())) {
      throw new CatalogBrandNameConflict();
    }
    const id = `brand-${this.state.nextId++}`;
    this.state.brands.push({ id, name, active: true, version: 1 });
    return { id };
  }

  async updateBrand(brandId: string, fields: BrandFields): Promise<void> {
    if (this.store.brandNameConflicts.has(fields.name.toLowerCase())) {
      throw new CatalogBrandNameConflict();
    }
    for (const brand of this.state.brands) {
      if (brand.id === brandId) {
        brand.name = fields.name;
        brand.active = fields.active;
        brand.version = fields.version;
      }
    }
  }

  async lockTag(tagId: string): Promise<LockTagResult> {
    this.store.lockCallOrder.push("lockTag");
    this.store.lockedTagIds.push(tagId);
    const tag = this.state.tags.find((row) => row.id === tagId);
    return tag
      ? { kind: "locked", tag: { name: tag.name, active: tag.active, version: tag.version } }
      : { kind: "not_found" };
  }

  async tagNameTaken(name: string, excludingTagId?: string): Promise<boolean> {
    return this.state.tags.some(
      (row) => row.name.toLowerCase() === name.toLowerCase() && row.id !== excludingTagId,
    );
  }

  async insertTag(name: string): Promise<{ id: string }> {
    if (this.store.tagNameConflicts.has(name.toLowerCase())) {
      throw new CatalogTagNameConflict();
    }
    const id = `tag-${this.state.nextId++}`;
    this.state.tags.push({ id, name, active: true, version: 1 });
    return { id };
  }

  async updateTag(tagId: string, fields: TagFields): Promise<void> {
    if (this.store.tagNameConflicts.has(fields.name.toLowerCase())) {
      throw new CatalogTagNameConflict();
    }
    for (const tag of this.state.tags) {
      if (tag.id === tagId) {
        tag.name = fields.name;
        tag.active = fields.active;
        tag.version = fields.version;
      }
    }
  }
}

export class FakeCatalogStore implements CatalogStore {
  private state: FakeCatalogState = emptyState();

  // Codes that raise `CatalogBarcodeConflict` when an insert reaches them, mapped to the id of the
  // product that (in the scenario a test is modeling) committed that code first. Invisible to a
  // pre-check made from inside the transaction, since that's a plain read of `state`; returned by
  // `activeBarcodesTaken` called on the store itself, simulating the re-read after a rollback.
  barcodeConflicts = new Map<string, string>();

  // Category names (already lowercased) that raise `CatalogCategoryNameConflict` on insert or
  // update, regardless of what a same-transaction `siblingNameTaken` pre-check found.
  categoryNameConflicts = new Set<string>();

  // Brand names (already lowercased) that raise `CatalogBrandNameConflict` on insert or update,
  // regardless of what a same-transaction `brandNameTaken` pre-check found.
  brandNameConflicts = new Set<string>();

  // Tag names (already lowercased) that raise `CatalogTagNameConflict` on insert or update,
  // regardless of what a same-transaction `tagNameTaken` pre-check found.
  tagNameConflicts = new Set<string>();

  lockCallOrder: string[] = [];
  lockedTagIds: string[] = [];
  barcodeReplacements: { product: LockedProduct; barcodes: string[] }[] = [];
  transactionCount = 0;

  seedBrand(brand: FakeBrandRow): void {
    this.state.brands.push({ ...brand });
  }

  seedTag(tag: FakeTagRow): void {
    this.state.tags.push({ ...tag });
  }

  seedCategory(category: FakeCategoryRow): void {
    this.state.categories.push({ ...category });
  }

  seedProduct(
    product: FakeProductRow,
    barcodes: readonly { code: string; active?: boolean }[],
    tagIds: readonly string[] = [],
  ): void {
    this.state.products.push({ ...product });
    for (const tagId of tagIds) {
      this.state.productTags.push({ productId: product.id, tagId });
    }
    for (const barcode of barcodes) {
      this.state.barcodes.push({
        productId: product.id,
        code: barcode.code,
        active: barcode.active ?? true,
      });
    }
  }

  snapshot(): FakeCatalogState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: CatalogStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneState(this.state);
    try {
      return await work(new FakeCatalogStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }

  async activeBarcodesTaken(
    codes: readonly string[],
    excludingProductId?: string,
  ): Promise<string[]> {
    const committed = activeBarcodesTaken(this.state, codes, excludingProductId);
    const raced = [...this.barcodeConflicts.entries()]
      .filter(([code, productId]) => codes.includes(code) && productId !== excludingProductId)
      .map(([code]) => code);
    return [...new Set([...committed, ...raced])];
  }
}
