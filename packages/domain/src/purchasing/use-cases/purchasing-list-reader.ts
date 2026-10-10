import type { SaleUnit } from "../../catalog/index.js";
import type { ReceiptType } from "../model/purchase.js";
import type { Packaging, Supplier } from "./purchasing-store.js";

export interface PackagingListing extends Packaging {
  productName: string;
  productSaleUnit: SaleUnit;
}

export interface PurchaseLineListing {
  id: string;
  product: { id: string; name: string; saleUnit: SaleUnit };
  packaging: { id: string; name: string } | null;
  packages: number | null;
  quantity: number;
  costPaidCents: number;
  quantityPerPackage: number;
  lotNumber: string | null;
  expiresOn: string | null;
}

export interface PurchaseListing {
  id: string;
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
  packagings(): Promise<PackagingListing[]>;
  packaging(packagingId: string): Promise<PackagingListing | undefined>;
  // The branch's purchases, most recently recorded first.
  purchases(locationId: string): Promise<PurchaseListing[]>;
  purchase(purchaseId: string): Promise<PurchaseListing | undefined>;
}
