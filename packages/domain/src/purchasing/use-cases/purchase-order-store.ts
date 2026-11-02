import type { SaleUnit } from "../../catalog/index.js";
import type { PurchaseOrderState } from "../model/purchase-order.js";
import type { LockProductResult, LockSupplierResult } from "./purchasing-store.js";

export interface PurchaseOrderLineFields {
  productId: string;
  packages: number;
  quantityPerPackage: number;
  expectedPackagePriceCents: number | null;
}

export interface NewPurchaseOrderFields {
  supplierId: string;
  locationId: string;
  createdAt: Date;
  actorId: string;
}

export interface NewPurchaseOrderLineFields extends PurchaseOrderLineFields {
  purchaseOrderId: string;
  position: number;
}

// What a supplier's confirmed lists say about an item it has linked to a product: the quantity
// the link states for each package, and the package price of the item's latest list as the list
// prints it.
export interface SupplierProductOffer {
  link: { quantity: number; saleUnit: SaleUnit; relinkRequired: boolean };
  priceCents: number;
  pricesIncludeVat: boolean;
  // In basis points, null when the item has none.
  vatRate: number | null;
}

export interface LockedPurchaseOrder {
  id: string;
  supplierId: string;
  state: PurchaseOrderState;
  lines: PurchaseOrderLineFields[];
}

export type LockPurchaseOrderResult =
  | { kind: "not_found" }
  | { kind: "locked"; order: LockedPurchaseOrder };

export interface PurchaseOrderStoreTransaction {
  lockSupplier(supplierId: string): Promise<LockSupplierResult>;
  holdPurchasedProduct(productId: string): Promise<LockProductResult>;
  // One offer for each item the supplier has linked to the product, smallest package first.
  supplierOffers(supplierId: string, productId: string): Promise<SupplierProductOffer[]>;
  insertDraftPurchaseOrder(fields: NewPurchaseOrderFields): Promise<{ id: string }>;
  insertPurchaseOrderLine(fields: NewPurchaseOrderLineFields): Promise<void>;
  // Holds the row of an order of the branch; an order of another branch is not found.
  lockPurchaseOrder(locationId: string, orderId: string): Promise<LockPurchaseOrderResult>;
  replacePurchaseOrderLines(
    orderId: string,
    lines: readonly PurchaseOrderLineFields[],
  ): Promise<void>;
  markPurchaseOrderSent(orderId: string, sending: { sentAt: Date; actorId: string }): Promise<void>;
  cancelPurchaseOrder(
    orderId: string,
    cancellation: { cancelledAt: Date; actorId: string },
  ): Promise<void>;
}

export interface PurchaseOrderStore {
  transaction<TOutcome>(
    work: (tx: PurchaseOrderStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
