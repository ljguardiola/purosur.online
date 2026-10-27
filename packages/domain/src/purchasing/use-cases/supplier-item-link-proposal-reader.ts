export interface ProposalRow {
  description: string;
  presentation: string | null;
  barcode: string | null;
}

export interface ProposalProduct {
  id: string;
  name: string;
}

export interface SupplierItemLinkProposalReader {
  // Undefined when the list has no such row.
  row(listId: string, rowId: string): Promise<ProposalRow | undefined>;
  // The active products carrying exactly that barcode among their active barcodes.
  activeProductsWithBarcode(barcode: string): Promise<ProposalProduct[]>;
  activeProducts(): Promise<ProposalProduct[]>;
}
