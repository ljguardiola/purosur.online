import type { ProductBrandAndNetContent, SaleUnit } from "../../catalog/index.js";
import type { LotNameFacts } from "../../stock/index.js";
import type { FreightMeans } from "../model/freight.js";
import type { ReceiptType } from "../model/purchase.js";
import type { Supplier } from "./purchasing-store.js";

export interface PurchaseLineListing {
  id: string;
  product: ProductBrandAndNetContent & { id: string; name: string; saleUnit: SaleUnit };
  packages: number | null;
  quantity: number;
  costPaidCents: number;
  quantityPerPackage: number;
  // The lot the line created; the units split from it into lots of their own are not in it.
  lotId: string;
  remainingInLot: number;
  expiresOn: string | null;
}

export interface PurchaseFreightListing {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  means: FreightMeans;
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
  // Every freight linked to the purchase, newest first, whatever its date.
  freights: PurchaseFreightListing[];
}

export interface PurchasingListReader {
  suppliers(): Promise<Supplier[]>;
  supplierName(supplierId: string): Promise<string | undefined>;
  // The branch's purchases, most recently recorded first; every supplier's when none is asked for.
  purchases(locationId: string, supplierId?: string): Promise<PurchaseListing[]>;
  // Every lot of each product in the branch, whatever purchase or origin created it.
  lotNameFacts(locationId: string, productIds: readonly string[]): Promise<LotNameFacts[]>;
  purchase(purchaseId: string): Promise<PurchaseListing | undefined>;
}
