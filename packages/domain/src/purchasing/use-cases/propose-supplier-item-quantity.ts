import type { NetContentUnit, SaleUnit } from "../../catalog/index.js";
import type { ZoneRulesSource } from "../../shared/index.js";
import { collectAiCalls } from "./ai-call-recording.js";
import { linkableQuantityOrNull, readingOrUnavailable } from "./proposed-quantity.js";
import type { SupplierItemLinkProposalReader } from "./supplier-item-link-proposal-reader.js";
import type { SupplierItemProposalStore } from "./supplier-item-proposal-store.js";
import type { SupplierItemQuantityReader } from "./supplier-item-quantity-reader.js";
import type { SupplierPriceListAiCallStore } from "./supplier-price-list-ai-call-store.js";

export interface ProposeSupplierItemQuantityPorts {
  reader: SupplierItemLinkProposalReader;
  quantityReader: SupplierItemQuantityReader;
  aiCalls: SupplierPriceListAiCallStore;
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
  { reader, quantityReader, aiCalls, store, zoneRules }: ProposeSupplierItemQuantityPorts,
  input: ProposeSupplierItemQuantityInput,
): Promise<ProposeSupplierItemQuantityOutcome> {
  const row = await reader.row(input.listId, input.rowId);
  if (!row) {
    return { kind: "not_found" };
  }

  const shape = { saleUnit: input.saleUnit, netContent: input.netContent };
  if (!input.refresh) {
    const kept = await store.keptQuantityProposal(input.rowId, shape);
    if (kept) {
      return kept;
    }
  }

  const collector = collectAiCalls(input.now, zoneRules);
  const reading = await readingOrUnavailable(() =>
    quantityReader.read(
      {
        description: row.description,
        presentation: row.presentation,
        otherPresentations: row.otherPresentations,
      },
      shape,
      collector.onCall,
    ),
  );
  const records = collector.records({
    purpose: "LINK_PROPOSAL",
    listId: input.listId,
    rowId: input.rowId,
    actorId: input.actorId,
  });
  if (records.length > 0) {
    await aiCalls.record(records);
  }
  if (reading.kind === "unavailable") {
    return reading;
  }
  const quantity =
    reading.kind === "read" ? linkableQuantityOrNull(input.saleUnit, reading.quantity) : null;
  const proposal =
    quantity === null ? ({ kind: "none" } as const) : { kind: "proposed" as const, quantity };
  await store.keepQuantityProposal(input.rowId, shape, proposal);
  return proposal;
}
