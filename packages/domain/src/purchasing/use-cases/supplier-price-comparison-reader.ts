import type { SaleUnit } from "../../catalog/index.js";

export interface ComparableProduct {
  id: string;
  name: string;
  categoryName: string;
  saleUnit: SaleUnit;
}

// What a supplier's current confirmed list says about an item linked to a product: each linked
// item's latest price by list date, ties going to the list confirmed later.
export interface SupplierOffer {
  productId: string;
  supplier: { id: string; name: string };
  packaging: { name: string; quantityPerPackage: number };
  priceCents: number;
  pricesIncludeVat: boolean;
  // In basis points, null for an item whose list prices include VAT.
  vatRate: number | null;
  listDate: string;
}

export interface SupplierPriceComparisonReader {
  activeProducts(): Promise<ComparableProduct[]>;
  // Ordered by supplier name.
  offers(): Promise<SupplierOffer[]>;
}
