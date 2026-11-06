import type { NetContentUnit, SaleUnit } from "../../catalog/index.js";
import type { ZoneRulesSource } from "../../shared/index.js";
import { collectAiCalls } from "./ai-call-recording.js";
import { isSameProposalItem } from "./proposal-asked-from.js";
import { linkableQuantityOrNull, readingOrUnavailable } from "./proposed-quantity.js";
import type { SupplierItemLinkProposalReader } from "./supplier-item-link-proposal-reader.js";
import type {
  QuantityProposalAnswer,
  SupplierItemProposalStore,
} from "./supplier-item-proposal-store.js";
import type { SupplierItemQuantityReader } from "./supplier-item-quantity-reader.js";

export interface ProposeSupplierItemQuantityPorts {
  reader: SupplierItemLinkProposalReader;
  quantityReader: SupplierItemQuantityReader;
  store: SupplierItemProposalStore;
  zoneRules: ZoneRulesSource;
}

export interface ProposeSupplierItemQuantityInput {
  listId: string;
  rowId: string;
  actorId: string;
  now: () => Date;
  saleUnit: SaleUnit;
  netContent: { quantity: number; unit: NetContentUnit } | null;
  // Asks the AI again even when a proposal is kept for the row and the product's shape.
  refresh: boolean;
}

export type ProposeSupplierItemQuantityOutcome =
  | { kind: "not_found" }
  // In thousandths of the sale unit.
  | { kind: "proposed"; quantity: number }
  | { kind: "none" }
  | { kind: "unavailable" };

// A proposal is never applied: what is written is what the AI call costs and the proposal a call produced.
export async function proposeSupplierItemQuantity(
  { reader, quantityReader, store, zoneRules }: ProposeSupplierItemQuantityPorts,
  input: ProposeSupplierItemQuantityInput,
): Promise<ProposeSupplierItemQuantityOutcome> {
  const row = await reader.row(input.listId, input.rowId);
  if (!row) {
    return { kind: "not_found" };
  }

  const shape = { saleUnit: input.saleUnit, netContent: input.netContent };
  const item = {
    description: row.description,
    presentation: row.presentation,
    otherPresentations: row.otherPresentations,
  };
  if (!input.refresh) {
    const kept = await store.keptQuantityProposal(input.rowId, shape);
    if (kept && isSameProposalItem(kept.askedFrom, item)) {
      return kept.answer;
    }
  }

  const collector = collectAiCalls(input.now, zoneRules);
  const reading = await readingOrUnavailable(() =>
    quantityReader.read(item, shape, collector.onCall),
  );
  const quantity =
    reading.kind === "read" ? linkableQuantityOrNull(input.saleUnit, reading.quantity) : null;
  const answer: QuantityProposalAnswer | null =
    reading.kind === "unavailable"
      ? null
      : quantity === null
        ? { kind: "none" }
        : { kind: "proposed", quantity };
  const recording = await store.recordQuantityProposal(
    input.rowId,
    shape,
    collector.records({
      purpose: "LINK_PROPOSAL",
      listId: input.listId,
      rowId: input.rowId,
      actorId: input.actorId,
    }),
    answer && { askedFrom: item, answer },
  );
  if (recording === "row_gone") {
    return { kind: "not_found" };
  }
  return answer ?? { kind: "unavailable" };
}
