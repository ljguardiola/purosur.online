import type { ProductBrandAndNetContent, SaleUnit } from "../../catalog/index.js";
import type { PurchaseOrderState } from "../model/purchase-order.js";
import type { SupplierProductOffer } from "./purchase-order-store.js";

export interface PurchaseOrderListing {
  id: string;
  supplier: { id: string; name: string };
  state: PurchaseOrderState;
  createdAt: Date;
  lines: { packages: number; expectedPackagePriceCents: number | null }[];
}

export interface PurchaseOrderLineListing {
  product: ProductBrandAndNetContent & { id: string; name: string; saleUnit: SaleUnit };
  packages: number;
  quantityPerPackage: number;
  expectedPackagePriceCents: number | null;
  // The supplier's own item for the product at this quantity per package, when it has one.
  supplierItem: { code: string | null; description: string } | null;
  // What earlier receipts brought of the product, in thousandths.
  receivedQuantity: number;
}

export interface PurchaseOrderReceiptListing {
  id: string;
  receivedAt: Date;
  purchaseId: string;
  lines: {
    productId: string;
    receivedQuantity: number;
    missingQuantity: number;
    priceDifferenceCents: number | null;
  }[];
}

export interface PurchaseOrderDetailListing {
  id: string;
  supplier: { id: string; name: string };
  state: PurchaseOrderState;
  createdAt: Date;
  lines: PurchaseOrderLineListing[];
  // Oldest first.
  receipts: PurchaseOrderReceiptListing[];
}

export interface ReceivableOrderLineListing {
  product: ProductBrandAndNetContent & { id: string; name: string; saleUnit: SaleUnit };
  packages: number;
  quantityPerPackage: number;
  receivedQuantity: number;
  // The supplier's item an order takes for the line, when it has one.
  supplierOffer: SupplierProductOffer | null;
}

export interface ReceivableOrderListing {
  id: string;
  supplier: { id: string; name: string };
  state: PurchaseOrderState;
  lines: ReceivableOrderLineListing[];
}

export interface PurchaseOrderReader {
  // The branch's orders, most recently created first; every state when none is asked for.
  orders(locationId: string, state?: PurchaseOrderState): Promise<PurchaseOrderListing[]>;
  order(locationId: string, orderId: string): Promise<PurchaseOrderDetailListing | undefined>;
  // The order with what a purchase that receives it needs to be prefilled.
  receivableOrder(locationId: string, orderId: string): Promise<ReceivableOrderListing | undefined>;
}
