import type {
  CatalogNetContent,
  CatalogStore,
  CatalogStoreTransaction,
  CategoryFields,
  LockCategoryResult,
  LockedProduct,
  LockLeafCategoryResult,
  LockParentForNewChildResult,
  LockProductResult,
  NewProductFields,
  ProductFields,
} from "../catalog-store.js";
import { CatalogBarcodeConflict, CatalogCategoryNameConflict } from "../catalog-store.js";

export interface FakeCategoryRow {
  id: string;
  name: string;
  parentId: string | null;
  version: number;
}

export interface FakeProductRow {
  id: string;
  name: string;
  categoryId: string;
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

export interface FakeCatalogState {
  categories: FakeCategoryRow[];
  products: FakeProductRow[];
  barcodes: FakeBarcodeRow[];
  nextId: number;
}

function emptyState(): FakeCatalogState {
  return { categories: [], products: [], barcodes: [], nextId: 1 };
}

function cloneState(state: FakeCatalogState): FakeCatalogState {
  return {
    categories: state.categories.map((row) => ({ ...row })),
    products: state.products.map((row) => ({
      ...row,
      netContent: row.netContent ? { ...row.netContent } : null,
    })),
    barcodes: state.barcodes.map((row) => ({ ...row })),
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
          product: { id: product.id, version: product.version, active: product.active },
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
        product.saleUnit = fields.saleUnit;
        product.netContent = fields.netContent;
        product.version = fields.version;
      }
    }
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

  lockCallOrder: string[] = [];
  barcodeReplacements: { product: LockedProduct; barcodes: string[] }[] = [];
  transactionCount = 0;

  seedCategory(category: FakeCategoryRow): void {
    this.state.categories.push({ ...category });
  }

  seedProduct(
    product: FakeProductRow,
    barcodes: readonly { code: string; active?: boolean }[],
  ): void {
    this.state.products.push({ ...product });
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
