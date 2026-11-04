import type { ProductBrandAndNetContent, SaleUnit } from "../../catalog/index.js";
import type { LotNameFacts } from "../../stock/index.js";
import type { ReceiptType } from "../model/purchase.js";
import type { Supplier } from "./purchasing-store.js";

export interface PurchaseLineListing {
  id: string;
  product: ProductBrandAndNetContent & { id: string; name: string; saleUnit: SaleUnit };
  packages: number | null;
  quantity: number;
  costPaidCents: number;
  quantityPerPackage: number;
  lotId: string;
  expiresOn: string | null;
}

export interface PurchaseListing {
  id: string;
  locationId: string;
  purchasedOn: string;
  supplier: { id: string; name: string };
  receiptType: ReceiptType;
  receiptNumber: string | null;
  note: string | null;
  recordedAt: Date;
  lines: PurchaseLineListing[];
}

export interface PurchasingListReader {
  suppliers(): Promise<Supplier[]>;
  // The branch's purchases, most recently recorded first.
  purchases(locationId: string): Promise<PurchaseListing[]>;
  // Every lot of each product in the branch, whatever purchase or origin created it.
  lotNameFacts(locationId: string, productIds: readonly string[]): Promise<LotNameFacts[]>;
  purchase(purchaseId: string): Promise<PurchaseListing | undefined>;
}
