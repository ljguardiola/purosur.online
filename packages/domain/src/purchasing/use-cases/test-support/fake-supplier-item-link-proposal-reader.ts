import type {
  ProposalProduct,
  ProposalRow,
  SupplierItemLinkProposalReader,
} from "../supplier-item-link-proposal-reader.js";

export interface FakeProposalData {
  rows?: (Omit<ProposalRow, "otherPresentations"> & { listId: string; id: string })[];
  products?: (Pick<ProposalProduct, "id" | "name"> &
    Partial<Pick<ProposalProduct, "brandName" | "netContent" | "saleUnit">> & {
      barcodes?: string[];
    })[];
}

function proposalProduct({
  id,
  name,
  brandName,
  netContent,
  saleUnit,
}: Required<FakeProposalData>["products"][number]): ProposalProduct {
  return {
    id,
    name,
    brandName: brandName ?? null,
    netContent: netContent ?? null,
    saleUnit: saleUnit ?? "UNIT",
  };
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
          otherPresentations: [
            ...new Set(
              this.data.rows.flatMap((other) =>
                other.listId === listId &&
                other.id !== rowId &&
                other.description === found.description &&
                other.presentation !== null
                  ? [other.presentation]
                  : [],
              ),
            ),
          ],
        }
      : undefined;
  }

  async activeProductsWithBarcode(barcode: string): Promise<ProposalProduct[]> {
    this.barcodeLookups.push(barcode);
    return this.data.products
      .filter((product) => product.barcodes?.includes(barcode))
      .map(proposalProduct);
  }

  async activeProducts(): Promise<ProposalProduct[]> {
    this.activeProductReads += 1;
    return this.data.products.map(proposalProduct);
  }
}
