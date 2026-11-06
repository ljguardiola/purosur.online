import type { NetContentUnit, ProductActivityScope, SaleUnit } from "../../catalog/index.js";

export interface ProposalRow {
  description: string;
  presentation: string | null;
  barcode: string | null;
  // The presentations the other rows of the list state for the same description, without repeats.
  otherPresentations: string[];
}

export interface ProposalProduct {
  id: string;
  name: string;
  brandName: string | null;
  netContent: { quantity: number; unit: NetContentUnit } | null;
  saleUnit: SaleUnit;
}

export interface SupplierItemLinkProposalReader {
  // Undefined when the list has no such row.
  row(listId: string, rowId: string): Promise<ProposalRow | undefined>;
  // The products of the scope carrying exactly that barcode among their active barcodes.
  productsWithBarcode(barcode: string, scope: ProductActivityScope): Promise<ProposalProduct[]>;
  products(scope: ProductActivityScope): Promise<ProposalProduct[]>;
  // Undefined when the product is not among those of the scope.
  product(productId: string, scope: ProductActivityScope): Promise<ProposalProduct | undefined>;
}
