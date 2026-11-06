import type { AiCallRecord } from "../ai-call-recording.js";
import type {
  KeptLinkProposal,
  KeptQuantityProposal,
  ProposalRecording,
  QuantityProposalShape,
  SupplierItemProposalStore,
} from "../supplier-item-proposal-store.js";

function shapeKey(rowId: string, { saleUnit, netContent }: QuantityProposalShape): string {
  return JSON.stringify([rowId, saleUnit, netContent?.quantity ?? null, netContent?.unit ?? null]);
}

export class FakeSupplierItemProposalStore implements SupplierItemProposalStore {
  readonly links = new Map<string, KeptLinkProposal>();
  readonly quantities = new Map<string, KeptQuantityProposal>();
  readonly recorded: AiCallRecord[] = [];
  readonly goneRows = new Set<string>();
  linkWrites = 0;
  quantityWrites = 0;
  failure: Error | null = null;

  async keptLinkProposal(rowId: string): Promise<KeptLinkProposal | undefined> {
    return this.links.get(rowId);
  }

  async keptQuantityProposal(
    rowId: string,
    shape: QuantityProposalShape,
  ): Promise<KeptQuantityProposal | undefined> {
    return this.quantities.get(shapeKey(rowId, shape));
  }

  async recordLinkProposal(
    rowId: string,
    calls: AiCallRecord[],
    kept: KeptLinkProposal | null,
  ): Promise<ProposalRecording> {
    return this.recordAndKeep(rowId, calls, kept, (proposal) => {
      this.linkWrites += 1;
      this.links.set(rowId, structuredClone(proposal));
    });
  }

  async recordQuantityProposal(
    rowId: string,
    shape: QuantityProposalShape,
    calls: AiCallRecord[],
    kept: KeptQuantityProposal | null,
  ): Promise<ProposalRecording> {
    return this.recordAndKeep(rowId, calls, kept, (proposal) => {
      this.quantityWrites += 1;
      this.quantities.set(shapeKey(rowId, shape), structuredClone(proposal));
    });
  }

  private recordAndKeep<T>(
    rowId: string,
    calls: AiCallRecord[],
    kept: T | null,
    keep: (proposal: T) => void,
  ): ProposalRecording {
    if (this.failure !== null) {
      throw this.failure;
    }
    this.recorded.push(...calls.map((call) => ({ ...call })));
    if (kept === null) {
      return "recorded";
    }
    if (this.goneRows.has(rowId)) {
      return "row_gone";
    }
    keep(kept);
    return "recorded";
  }
}
