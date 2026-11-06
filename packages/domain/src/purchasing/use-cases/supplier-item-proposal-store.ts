import type { NetContentUnit, SaleUnit } from "../../catalog/index.js";

export type KeptLinkProposal =
  | {
      kind: "proposed";
      by: "barcode" | "ai";
      productId: string;
      // In thousandths of the product's sale unit; null when it could not be told.
      quantity: number | null;
    }
  | { kind: "none" };

export interface QuantityProposalShape {
  saleUnit: SaleUnit;
  netContent: { quantity: number; unit: NetContentUnit } | null;
}

export type KeptQuantityProposal =
  // In thousandths of the sale unit.
  { kind: "proposed"; quantity: number } | { kind: "none" };

export interface SupplierItemProposalStore {
  keptLinkProposal(rowId: string): Promise<KeptLinkProposal | undefined>;
  keepLinkProposal(rowId: string, proposal: KeptLinkProposal): Promise<void>;
  keptQuantityProposal(
    rowId: string,
    shape: QuantityProposalShape,
  ): Promise<KeptQuantityProposal | undefined>;
  keepQuantityProposal(
    rowId: string,
    shape: QuantityProposalShape,
    proposal: KeptQuantityProposal,
  ): Promise<void>;
}
