import type { ProductActivityScope, SaleUnit } from "../../catalog/index.js";
import type { Packaging, Supplier } from "./purchasing-store.js";

export interface PackagingListing extends Packaging {
  productName: string;
  saleUnit: SaleUnit;
}

export interface PackageableProduct {
  id: string;
  name: string;
  saleUnit: SaleUnit;
}

export interface PurchasingListReader {
  suppliers(): Promise<Supplier[]>;
  packagings(): Promise<PackagingListing[]>;
  packaging(packagingId: string): Promise<PackagingListing | undefined>;
  products(scope: ProductActivityScope): Promise<PackageableProduct[]>;
}
