import type { SaleUnit } from "../../catalog/index.js";
import type { PriceReviewPostponement } from "../../pricing/index.js";
import type { PurchaseReceipt } from "../../stock/index.js";
import type { ReceiptType } from "../model/purchase.js";

export interface Supplier {
  id: string;
  name: string;
  cuit: string | null;
  contact: string | null;
  note: string | null;
  active: boolean;
  version: number;
}

export interface Packaging {
  id: string;
  productId: string;
  name: string;
  quantityPerPackage: number;
  saleUnit: SaleUnit;
  active: boolean;
  version: number;
}

export interface NewSupplierFields {
  name: string;
  cuit: string | null;
  contact: string | null;
  note: string | null;
  actorId: string;
}

export interface SupplierFields extends NewSupplierFields {
  active: boolean;
  version: number;
}

export interface NewPackagingFields {
  productId: string;
  name: string;
  quantityPerPackage: number;
  saleUnit: SaleUnit;
  actorId: string;
}

export interface PackagingFields {
  name: string;
  quantityPerPackage: number;
  saleUnit: SaleUnit;
  active: boolean;
  version: number;
  actorId: string;
}

export interface NewPurchaseFields {
  supplierId: string;
  locationId: string;
  purchasedOn: string;
  receiptType: ReceiptType;
  receiptNumber: string | null;
  note: string | null;
  recordedAt: Date;
  actorId: string;
}

export interface NewPurchaseLineFields {
  purchaseId: string;
  position: number;
  productId: string;
  packagingId: string | null;
  packages: number | null;
  quantity: number;
  costPaidCents: number;
  quantityPerPackage: number;
  lotNumber: string | null;
  expiresOn: string | null;
}

export type LockSupplierResult = { kind: "not_found" } | { kind: "locked"; supplier: Supplier };

export type LockPackagingResult = { kind: "not_found" } | { kind: "locked"; packaging: Packaging };

export type LockProductResult =
  | { kind: "not_found" }
  | { kind: "locked"; product: { id: string; saleUnit: SaleUnit; active: boolean } };

// Raised by a write that loses the supplier name uniqueness to a concurrent write.
export class SupplierNameConflict extends Error {}

// Raised by a write that loses the supplier tax id uniqueness to a concurrent write.
export class SupplierCuitConflict extends Error {}

// Raised by a write that loses a product's packaging name uniqueness to a concurrent write.
export class PackagingNameConflict extends Error {}

export interface PurchasingStoreTransaction {
  lockSupplier(supplierId: string): Promise<LockSupplierResult>;
  // Every supplier counts, deactivated ones included, and letter case is ignored.
  supplierNameTaken(name: string, excludingSupplierId?: string): Promise<boolean>;
  // Every supplier counts, deactivated ones included.
  supplierCuitTaken(cuit: string, excludingSupplierId?: string): Promise<boolean>;
  insertSupplier(fields: NewSupplierFields): Promise<{ id: string }>;
  updateSupplier(supplierId: string, fields: SupplierFields): Promise<void>;
  // Holds the product's row so a concurrent change of its sale unit waits.
  lockProduct(productId: string): Promise<LockProductResult>;
  // Holds the product's row against a change of it while movements of its stock, which reference
  // it, may still be recorded.
  holdPurchasedProduct(productId: string): Promise<LockProductResult>;
  lockProductOfPackaging(packagingId: string): Promise<LockProductResult>;
  lockPackaging(packagingId: string): Promise<LockPackagingResult>;
  // Every packaging of the product counts, deactivated ones included, and letter case is ignored.
  packagingNameTaken(
    productId: string,
    name: string,
    excludingPackagingId?: string,
  ): Promise<boolean>;
  insertPackaging(fields: NewPackagingFields): Promise<{ id: string }>;
  updatePackaging(packagingId: string, fields: PackagingFields): Promise<void>;
  insertPurchase(fields: NewPurchaseFields): Promise<{ id: string }>;
  insertPurchaseLine(fields: NewPurchaseLineFields): Promise<{ id: string }>;
  postponePriceReviews(postponement: PriceReviewPostponement): Promise<void>;
  receiveStock(receipt: PurchaseReceipt): Promise<void>;
}

export interface PurchasingStore {
  transaction<TOutcome>(
    work: (tx: PurchasingStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
