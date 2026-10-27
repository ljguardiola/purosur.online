import type {
  ProposalProduct,
  ProposalRow,
  SupplierItemLinkProposalReader,
} from "../supplier-item-link-proposal-reader.js";

export interface FakeProposalData {
  rows?: (ProposalRow & { listId: string; id: string })[];
  products?: (ProposalProduct & { barcodes?: string[] })[];
}

export class FakeSupplierItemLinkProposalReader implements SupplierItemLinkProposalReader {
  readonly barcodeLookups: string[] = [];
  activeProductReads = 0;
  private readonly data: Required<FakeProposalData>;

  constructor(data: FakeProposalData = {}) {
    this.data = { rows: data.rows ?? [], products: data.products ?? [] };
  }

  async row(listId: string, rowId: string): Promise<ProposalRow | undefined> {
    const found = this.data.rows.find((row) => row.listId === listId && row.id === rowId);
    return found
      ? {
          description: found.description,
          presentation: found.presentation,
          barcode: found.barcode,
        }
      : undefined;
  }

  async activeProductsWithBarcode(barcode: string): Promise<ProposalProduct[]> {
    this.barcodeLookups.push(barcode);
    return this.data.products
      .filter((product) => product.barcodes?.includes(barcode))
      .map(({ id, name }) => ({ id, name }));
  }

  async activeProducts(): Promise<ProposalProduct[]> {
    this.activeProductReads += 1;
    return this.data.products.map(({ id, name }) => ({ id, name }));
  }
}
