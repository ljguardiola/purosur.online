import type { SaleUnit } from "../../catalog/index.js";
import type { Packaging, Supplier } from "./purchasing-store.js";

export interface PackagingListing extends Packaging {
  productName: string;
  productSaleUnit: SaleUnit;
}

export interface PurchasingListReader {
  suppliers(): Promise<Supplier[]>;
  packagings(): Promise<PackagingListing[]>;
  packaging(packagingId: string): Promise<PackagingListing | undefined>;
}
