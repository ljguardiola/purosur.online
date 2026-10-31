import type { ProductBrandAndNetContent, SaleUnit } from "../../catalog/index.js";

export interface ComparableProduct extends ProductBrandAndNetContent {
  id: string;
  name: string;
  categoryName: string;
  saleUnit: SaleUnit;
}

// What a supplier's confirmed lists say about an item linked to a product: the item's latest
// price by list date, ties going to the list confirmed later.
export interface SupplierOffer {
  productId: string;
  supplier: { id: string; name: string };
  link: { quantity: number; saleUnit: SaleUnit; relinkRequired: boolean };
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
