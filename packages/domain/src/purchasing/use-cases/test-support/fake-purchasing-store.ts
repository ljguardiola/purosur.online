import type { SaleUnit } from "../../../catalog/index.js";
import type { PriceReviewPostponement } from "../../../pricing/index.js";
import type { PurchaseReceipt } from "../../../stock/index.js";
import type {
  LockedPurchaseLine,
  LockPurchaseResult,
  LotCostCorrection,
  LotExpiryCorrection,
  LotExpirySplit,
  LotExpirySplitResult,
  PurchaseCorrection,
  PurchaseCorrectionStore,
  PurchaseCorrectionStoreTransaction,
  PurchasedLotsRedating,
  PurchaseHeaderValues,
} from "../purchase-correction-store.js";
import type {
  LockProductResult,
  LockSupplierResult,
  NewPurchaseFields,
  NewPurchaseLineFields,
  NewSupplierFields,
  PurchasingStore,
  PurchasingStoreTransaction,
  Supplier,
  SupplierFields,
} from "../purchasing-store.js";
import { SupplierCuitConflict, SupplierNameConflict } from "../purchasing-store.js";

interface FakeSupplierRow extends Supplier {
  writtenBy: string | null;
}

export interface FakeProductRow {
  id: string;
  name: string;
  saleUnit: SaleUnit;
  active: boolean;
}

interface FakePurchaseRow extends NewPurchaseFields {
  id: string;
}

interface FakePurchaseLineRow extends NewPurchaseLineFields {
  id: string;
}

export type FakePurchasingWrite =
  | "insertPurchase"
  | "insertPurchaseLine"
  | "postponePriceReviews"
  | "receiveStock"
  | "updatePurchaseHeader"
  | "updatePurchaseLineExpiry"
  | "updatePurchaseLineCost"
  | "correctLotExpiry"
  | "splitLotExpiry"
  | "correctLotCost"
  | "redatePurchasedLots"
  | "recordPurchaseCorrection";

export interface FakePurchasingState {
  suppliers: FakeSupplierRow[];
  products: FakeProductRow[];
  purchases: FakePurchaseRow[];
  purchaseLines: FakePurchaseLineRow[];
  receipts: PurchaseReceipt[];
  priceReviewPostponements: PriceReviewPostponement[];
  lotExpiryCorrections: LotExpiryCorrection[];
  lotExpirySplits: LotExpirySplit[];
  lotCostCorrections: LotCostCorrection[];
  lotRedatings: PurchasedLotsRedating[];
  corrections: PurchaseCorrection[];
  nextId: number;
}

function cloneState(state: FakePurchasingState): FakePurchasingState {
  return {
    suppliers: state.suppliers.map((row) => ({ ...row })),
    products: state.products.map((row) => ({ ...row })),
    purchases: state.purchases.map((row) => ({ ...row, recordedAt: new Date(row.recordedAt) })),
    purchaseLines: state.purchaseLines.map((row) => ({ ...row })),
    receipts: state.receipts.map((receipt) => ({
      ...receipt,
      occurredAt: new Date(receipt.occurredAt),
      lines: receipt.lines.map((line) => ({ ...line })),
    })),
    priceReviewPostponements: state.priceReviewPostponements.map((postponement) => ({
      ...postponement,
      postponedAt: new Date(postponement.postponedAt),
      productIds: [...postponement.productIds],
    })),
    lotExpiryCorrections: state.lotExpiryCorrections.map((row) => ({ ...row })),
    lotExpirySplits: state.lotExpirySplits.map((row) => ({
      ...row,
      occurredAt: new Date(row.occurredAt),
    })),
    lotCostCorrections: state.lotCostCorrections.map((row) => ({
      ...row,
      changedAt: new Date(row.changedAt),
    })),
    lotRedatings: state.lotRedatings.map((row) => ({
      ...row,
      purchaseLineIds: [...row.purchaseLineIds],
    })),
    corrections: state.corrections.map((row) => ({
      ...row,
      correctedAt: new Date(row.correctedAt),
      change: structuredClone(row.change),
    })),
    nextId: state.nextId,
  };
}

function sameText(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

class FakePurchasingStoreTransaction
  implements PurchasingStoreTransaction, PurchaseCorrectionStoreTransaction
{
  private readonly state: FakePurchasingState;
  private readonly store: FakePurchasingStore;

  constructor(state: FakePurchasingState, store: FakePurchasingStore) {
    this.state = state;
    this.store = store;
  }

  async lockSupplier(supplierId: string): Promise<LockSupplierResult> {
    this.store.lockCallOrder.push("lockSupplier");
    this.store.lockLog.push(`supplier:${supplierId}`);
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

  async holdPurchasedProduct(productId: string): Promise<LockProductResult> {
    this.store.lockCallOrder.push("holdPurchasedProduct");
    this.store.lockLog.push(`product:${productId}`);
    return this.lockedProduct(productId);
  }

  async insertPurchase(fields: NewPurchaseFields): Promise<{ id: string }> {
    this.beforeWrite("insertPurchase");
    const id = `purchase-${this.state.nextId++}`;
    this.state.purchases.push({ ...fields, id });
    return { id };
  }

  async insertPurchaseLine(fields: NewPurchaseLineFields): Promise<{ id: string }> {
    this.beforeWrite("insertPurchaseLine");
    const id = `purchase-line-${this.state.nextId++}`;
    this.state.purchaseLines.push({ ...fields, id });
    return { id };
  }

  async postponePriceReviews(postponement: PriceReviewPostponement): Promise<void> {
    this.beforeWrite("postponePriceReviews");
    this.state.priceReviewPostponements.push({
      ...postponement,
      productIds: [...postponement.productIds],
    });
  }

  async receiveStock(receipt: PurchaseReceipt): Promise<void> {
    this.beforeWrite("receiveStock");
    this.store.lockLog.push("stock receipt");
    this.state.receipts.push({ ...receipt, lines: receipt.lines.map((line) => ({ ...line })) });
  }

  async lockPurchase(locationId: string, purchaseId: string): Promise<LockPurchaseResult> {
    this.store.lockCallOrder.push("lockPurchase");
    this.store.lockLog.push(`purchase:${purchaseId}`);
    const row = this.state.purchases.find(
      (purchase) => purchase.id === purchaseId && purchase.locationId === locationId,
    );
    if (!row) {
      return { kind: "not_found" };
    }
    const positions = this.state.purchaseLines
      .filter((line) => line.purchaseId === purchaseId)
      .map((line) => line.position);
    return {
      kind: "locked",
      purchase: {
        id: row.id,
        purchasedOn: row.purchasedOn,
        receiptType: row.receiptType,
        receiptNumber: row.receiptNumber,
        note: row.note,
        lastLinePosition: Math.max(0, ...positions),
      },
    };
  }

  async purchaseLine(purchaseId: string, lineId: string): Promise<LockedPurchaseLine | undefined> {
    const row = this.state.purchaseLines.find(
      (line) => line.id === lineId && line.purchaseId === purchaseId,
    );
    return row && { id: row.id, expiresOn: row.expiresOn, costPaidCents: row.costPaidCents };
  }

  async purchaseLineIds(purchaseId: string): Promise<string[]> {
    return this.state.purchaseLines
      .filter((line) => line.purchaseId === purchaseId)
      .sort((a, b) => a.position - b.position)
      .map((line) => line.id);
  }

  async updatePurchaseHeader(purchaseId: string, values: PurchaseHeaderValues): Promise<void> {
    this.beforeWrite("updatePurchaseHeader");
    for (const row of this.state.purchases) {
      if (row.id === purchaseId) {
        Object.assign(row, values);
      }
    }
  }

  async updatePurchaseLineExpiry(lineId: string, expiresOn: string | null): Promise<void> {
    this.beforeWrite("updatePurchaseLineExpiry");
    for (const row of this.state.purchaseLines) {
      if (row.id === lineId) {
        row.expiresOn = expiresOn;
      }
    }
  }

  async updatePurchaseLineCost(lineId: string, costPaidCents: number): Promise<void> {
    this.beforeWrite("updatePurchaseLineCost");
    for (const row of this.state.purchaseLines) {
      if (row.id === lineId) {
        row.costPaidCents = costPaidCents;
      }
    }
  }

  async correctLotCost(correction: LotCostCorrection): Promise<void> {
    this.beforeWrite("correctLotCost");
    this.store.lockLog.push("lot cost");
    this.state.lotCostCorrections.push({
      ...correction,
      changedAt: new Date(correction.changedAt),
    });
  }

  async correctLotExpiry(correction: LotExpiryCorrection): Promise<void> {
    this.beforeWrite("correctLotExpiry");
    this.store.lockLog.push("lot expiry");
    this.state.lotExpiryCorrections.push({ ...correction });
  }

  async splitLotExpiry(split: LotExpirySplit): Promise<LotExpirySplitResult> {
    this.beforeWrite("splitLotExpiry");
    this.store.lockLog.push("lot split");
    if (this.store.lotSplitResult.kind === "split") {
      this.state.lotExpirySplits.push({ ...split, occurredAt: new Date(split.occurredAt) });
    }
    return this.store.lotSplitResult;
  }

  async redatePurchasedLots(redating: PurchasedLotsRedating): Promise<void> {
    this.beforeWrite("redatePurchasedLots");
    this.store.lockLog.push("lot redating");
    this.state.lotRedatings.push({
      ...redating,
      purchaseLineIds: [...redating.purchaseLineIds],
    });
  }

  async recordPurchaseCorrection(correction: PurchaseCorrection): Promise<void> {
    this.beforeWrite("recordPurchaseCorrection");
    this.state.corrections.push({
      ...correction,
      correctedAt: new Date(correction.correctedAt),
      change: structuredClone(correction.change),
    });
  }

  private beforeWrite(operation: FakePurchasingWrite): void {
    if (this.store.writeFailsAtCall(operation)) {
      throw new Error(`${operation} failed`);
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
}

export class FakePurchasingStore implements PurchasingStore, PurchaseCorrectionStore {
  private state: FakePurchasingState = {
    suppliers: [],
    products: [],
    purchases: [],
    purchaseLines: [],
    receipts: [],
    priceReviewPostponements: [],
    lotExpiryCorrections: [],
    lotExpirySplits: [],
    lotCostCorrections: [],
    lotRedatings: [],
    corrections: [],
    nextId: 1,
  };

  lotSplitResult: LotExpirySplitResult = { kind: "split", lotId: "lot-split-1" };

  // Names (already lowercased) that raise the conflict on a write, regardless of what a
  // same-transaction check found, to model a concurrent write that committed first.
  supplierNameConflicts = new Set<string>();
  supplierCuitConflicts = new Set<string>();

  private readonly failingCalls = new Map<FakePurchasingWrite, number>();
  private readonly writeCalls = new Map<FakePurchasingWrite, number>();

  lockCallOrder: string[] = [];
  lockLog: string[] = [];
  transactionCount = 0;

  seedSupplier(supplier: Supplier): void {
    this.state.suppliers.push({ ...supplier, writtenBy: null });
  }

  seedPurchase(purchase: NewPurchaseFields & { id: string }): void {
    this.state.purchases.push({ ...purchase });
  }

  seedPurchaseLine(line: NewPurchaseLineFields & { id: string }): void {
    this.state.purchaseLines.push({ ...line });
  }

  seedProduct(product: FakeProductRow): void {
    this.state.products.push({ ...product });
  }

  failWriteAtCall(operation: FakePurchasingWrite, call: number): void {
    this.failingCalls.set(operation, call);
  }

  writeFailsAtCall(operation: FakePurchasingWrite): boolean {
    const call = (this.writeCalls.get(operation) ?? 0) + 1;
    this.writeCalls.set(operation, call);
    return this.failingCalls.get(operation) === call;
  }

  snapshot(): FakePurchasingState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (
      tx: PurchasingStoreTransaction & PurchaseCorrectionStoreTransaction,
    ) => Promise<TOutcome>,
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
