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

// What a supplier's confirmed lists say about the item it has linked to a product: the quantity
// the link states for each package, and the package price as the list prints it.
export interface SupplierProductOffer {
  link: { quantity: number; saleUnit: SaleUnit; relinkRequired: boolean };
  packagePriceCents: number;
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
  // The offer is undefined when the supplier has no item linked to the product.
  currentOffer(supplierId: string, productId: string): Promise<SupplierProductOffer | undefined>;
  insertDraftPurchaseOrder(fields: NewPurchaseOrderFields): Promise<{ id: string }>;
  insertPurchaseOrderLine(fields: NewPurchaseOrderLineFields): Promise<void>;
  // Holds the row of an order of the branch; an order of another branch is not found.
  lockPurchaseOrder(locationId: string, orderId: string): Promise<LockPurchaseOrderResult>;
  replacePurchaseOrderLines(
    orderId: string,
    lines: readonly PurchaseOrderLineFields[],
  ): Promise<void>;
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
