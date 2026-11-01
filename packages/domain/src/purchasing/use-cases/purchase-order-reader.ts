import type { ProductBrandAndNetContent, SaleUnit } from "../../catalog/index.js";
import type { PurchaseOrderState } from "../model/purchase-order.js";

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
}

export interface PurchaseOrderDetailListing {
  id: string;
  supplier: { id: string; name: string };
  state: PurchaseOrderState;
  createdAt: Date;
  lines: PurchaseOrderLineListing[];
}

export interface PurchaseOrderReader {
  // The branch's orders, most recently created first; every state when none is asked for.
  orders(locationId: string, state?: PurchaseOrderState): Promise<PurchaseOrderListing[]>;
  order(locationId: string, orderId: string): Promise<PurchaseOrderDetailListing | undefined>;
}
