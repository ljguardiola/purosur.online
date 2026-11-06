import type {
  KeptLinkProposal,
  KeptQuantityProposal,
  QuantityProposalShape,
  SupplierItemProposalStore,
} from "../supplier-item-proposal-store.js";

function shapeKey(rowId: string, { saleUnit, netContent }: QuantityProposalShape): string {
  return JSON.stringify([rowId, saleUnit, netContent?.quantity ?? null, netContent?.unit ?? null]);
}

export class FakeSupplierItemProposalStore implements SupplierItemProposalStore {
  readonly links = new Map<string, KeptLinkProposal>();
  readonly quantities = new Map<string, KeptQuantityProposal>();
  linkWrites = 0;
  quantityWrites = 0;

  async keptLinkProposal(rowId: string): Promise<KeptLinkProposal | undefined> {
    return this.links.get(rowId);
  }

  async keepLinkProposal(rowId: string, proposal: KeptLinkProposal): Promise<void> {
    this.linkWrites += 1;
    this.links.set(rowId, { ...proposal });
  }

  async keptQuantityProposal(
    rowId: string,
    shape: QuantityProposalShape,
  ): Promise<KeptQuantityProposal | undefined> {
    return this.quantities.get(shapeKey(rowId, shape));
  }

  async keepQuantityProposal(
    rowId: string,
    shape: QuantityProposalShape,
    proposal: KeptQuantityProposal,
  ): Promise<void> {
    this.quantityWrites += 1;
    this.quantities.set(shapeKey(rowId, shape), { ...proposal });
  }
}
