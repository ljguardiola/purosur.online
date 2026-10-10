import type { SaleUnit } from "../../../catalog/index.js";
import type {
  LockPackagingResult,
  LockProductResult,
  LockSupplierResult,
  NewPackagingFields,
  NewSupplierFields,
  Packaging,
  PackagingFields,
  PurchasingStore,
  PurchasingStoreTransaction,
  Supplier,
  SupplierFields,
} from "../purchasing-store.js";
import {
  PackagingNameConflict,
  SupplierCuitConflict,
  SupplierNameConflict,
} from "../purchasing-store.js";

interface FakeSupplierRow extends Supplier {
  writtenBy: string | null;
}

interface FakePackagingRow extends Packaging {
  writtenBy: string | null;
}

export interface FakeProductRow {
  id: string;
  name: string;
  saleUnit: SaleUnit;
  active: boolean;
}

export interface FakePurchasingState {
  suppliers: FakeSupplierRow[];
  packagings: FakePackagingRow[];
  products: FakeProductRow[];
  nextId: number;
}

function cloneState(state: FakePurchasingState): FakePurchasingState {
  return {
    suppliers: state.suppliers.map((row) => ({ ...row })),
    packagings: state.packagings.map((row) => ({ ...row })),
    products: state.products.map((row) => ({ ...row })),
    nextId: state.nextId,
  };
}

function sameText(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

class FakePurchasingStoreTransaction implements PurchasingStoreTransaction {
  private readonly state: FakePurchasingState;
  private readonly store: FakePurchasingStore;

  constructor(state: FakePurchasingState, store: FakePurchasingStore) {
    this.state = state;
    this.store = store;
  }

  async lockSupplier(supplierId: string): Promise<LockSupplierResult> {
    this.store.lockCallOrder.push("lockSupplier");
    const row = this.state.suppliers.find((supplier) => supplier.id === supplierId);
    if (!row) {
      return { kind: "not_found" };
    }
    const { writtenBy: _writtenBy, ...supplier } = row;
    return { kind: "locked", supplier };
  }

  async supplierNameTaken(name: string, excludingSupplierId?: string): Promise<boolean> {
    return this.state.suppliers.some(
      (row) => sameText(row.name, name) && row.id !== excludingSupplierId,
    );
  }

  async supplierCuitTaken(cuit: string, excludingSupplierId?: string): Promise<boolean> {
    return this.state.suppliers.some((row) => row.cuit === cuit && row.id !== excludingSupplierId);
  }

  async insertSupplier(fields: NewSupplierFields): Promise<{ id: string }> {
    this.raiseSupplierConflicts(fields);
    const id = `supplier-${this.state.nextId++}`;
    this.state.suppliers.push({
      id,
      name: fields.name,
      cuit: fields.cuit,
      contact: fields.contact,
      note: fields.note,
      active: true,
      version: 1,
      writtenBy: fields.actorId,
    });
    return { id };
  }

  async updateSupplier(supplierId: string, fields: SupplierFields): Promise<void> {
    this.raiseSupplierConflicts(fields);
    for (const row of this.state.suppliers) {
      if (row.id === supplierId) {
        row.name = fields.name;
        row.cuit = fields.cuit;
        row.contact = fields.contact;
        row.note = fields.note;
        row.active = fields.active;
        row.version = fields.version;
        row.writtenBy = fields.actorId;
      }
    }
  }

  async lockProduct(productId: string): Promise<LockProductResult> {
    this.store.lockCallOrder.push("lockProduct");
    return this.lockedProduct(productId);
  }

  async lockProductOfPackaging(packagingId: string): Promise<LockProductResult> {
    this.store.lockCallOrder.push("lockProductOfPackaging");
    const packaging = this.state.packagings.find((row) => row.id === packagingId);
    return packaging ? this.lockedProduct(packaging.productId) : { kind: "not_found" };
  }

  async lockPackaging(packagingId: string): Promise<LockPackagingResult> {
    this.store.lockCallOrder.push("lockPackaging");
    const row = this.state.packagings.find((packaging) => packaging.id === packagingId);
    if (!row || this.store.packagingsGoneOnceTheirProductIsLocked.has(packagingId)) {
      return { kind: "not_found" };
    }
    const { writtenBy: _writtenBy, ...packaging } = row;
    return { kind: "locked", packaging };
  }

  async packagingNameTaken(
    productId: string,
    name: string,
    excludingPackagingId?: string,
  ): Promise<boolean> {
    return this.state.packagings.some(
      (row) =>
        row.productId === productId && sameText(row.name, name) && row.id !== excludingPackagingId,
    );
  }

  async insertPackaging(fields: NewPackagingFields): Promise<{ id: string }> {
    this.raisePackagingConflict(fields.name);
    const id = `packaging-${this.state.nextId++}`;
    this.state.packagings.push({
      id,
      productId: fields.productId,
      name: fields.name,
      quantityPerPackage: fields.quantityPerPackage,
      saleUnit: fields.saleUnit,
      active: true,
      version: 1,
      writtenBy: fields.actorId,
    });
    return { id };
  }

  async updatePackaging(packagingId: string, fields: PackagingFields): Promise<void> {
    this.raisePackagingConflict(fields.name);
    for (const row of this.state.packagings) {
      if (row.id === packagingId) {
        row.name = fields.name;
        row.quantityPerPackage = fields.quantityPerPackage;
        row.saleUnit = fields.saleUnit;
        row.active = fields.active;
        row.version = fields.version;
        row.writtenBy = fields.actorId;
      }
    }
  }

  private lockedProduct(productId: string): LockProductResult {
    const product = this.state.products.find((row) => row.id === productId);
    return product
      ? {
          kind: "locked",
          product: { id: product.id, saleUnit: product.saleUnit, active: product.active },
        }
      : { kind: "not_found" };
  }

  private raiseSupplierConflicts(fields: NewSupplierFields): void {
    if (this.store.supplierNameConflicts.has(fields.name.toLowerCase())) {
      throw new SupplierNameConflict();
    }
    if (fields.cuit !== null && this.store.supplierCuitConflicts.has(fields.cuit)) {
      throw new SupplierCuitConflict();
    }
  }

  private raisePackagingConflict(name: string): void {
    if (this.store.packagingNameConflicts.has(name.toLowerCase())) {
      throw new PackagingNameConflict();
    }
  }
}

export class FakePurchasingStore implements PurchasingStore {
  private state: FakePurchasingState = { suppliers: [], packagings: [], products: [], nextId: 1 };

  // Names (already lowercased) that raise the conflict on a write, regardless of what a
  // same-transaction check found, to model a concurrent write that committed first.
  supplierNameConflicts = new Set<string>();
  supplierCuitConflicts = new Set<string>();
  packagingNameConflicts = new Set<string>();

  packagingsGoneOnceTheirProductIsLocked = new Set<string>();

  lockCallOrder: string[] = [];
  transactionCount = 0;

  seedSupplier(supplier: Supplier): void {
    this.state.suppliers.push({ ...supplier, writtenBy: null });
  }

  seedProduct(product: FakeProductRow): void {
    this.state.products.push({ ...product });
  }

  seedPackaging(packaging: Packaging): void {
    this.state.packagings.push({ ...packaging, writtenBy: null });
  }

  snapshot(): FakePurchasingState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: PurchasingStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneState(this.state);
    try {
      return await work(new FakePurchasingStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
