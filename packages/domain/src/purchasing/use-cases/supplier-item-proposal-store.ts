import type { NetContentUnit, SaleUnit } from "../../catalog/index.js";
import type { AiCallRecord } from "./ai-call-recording.js";
import type { ProductChoiceItem } from "./product-chooser.js";
import type { ProposalRow } from "./supplier-item-link-proposal-reader.js";

export type LinkProposalAnswer =
  | {
      kind: "proposed";
      by: "barcode" | "ai";
      productId: string;
      // The product's sale unit when it was proposed, which the quantity is counted in.
      saleUnit: SaleUnit;
      // In thousandths of that sale unit; null when it could not be told.
      quantity: number | null;
    }
  | { kind: "none" };

export interface KeptLinkProposal {
  askedFrom: ProposalRow;
  answer: LinkProposalAnswer;
}

export interface QuantityProposalShape {
  saleUnit: SaleUnit;
  netContent: { quantity: number; unit: NetContentUnit } | null;
}

export type QuantityProposalAnswer =
  // In thousandths of the sale unit.
  { kind: "proposed"; quantity: number } | { kind: "none" };

export interface KeptQuantityProposal {
  askedFrom: ProductChoiceItem;
  answer: QuantityProposalAnswer;
}

export type ProposalRecording = "recorded" | "row_gone";

export interface SupplierItemProposalStore {
  keptLinkProposal(rowId: string): Promise<KeptLinkProposal | undefined>;
  keptQuantityProposal(
    rowId: string,
    shape: QuantityProposalShape,
  ): Promise<KeptQuantityProposal | undefined>;
  // Records the calls and keeps the proposal, when there is one, in one transaction. row_gone when the row no longer
  // exists, with the calls still recorded.
  recordLinkProposal(
    rowId: string,
    calls: AiCallRecord[],
    kept: KeptLinkProposal | null,
  ): Promise<ProposalRecording>;
  recordQuantityProposal(
    rowId: string,
    shape: QuantityProposalShape,
    calls: AiCallRecord[],
    kept: KeptQuantityProposal | null,
  ): Promise<ProposalRecording>;
}
