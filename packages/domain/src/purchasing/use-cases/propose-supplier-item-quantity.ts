import type { NetContentUnit, SaleUnit } from "../../catalog/index.js";
import type { ZoneRulesSource } from "../../shared/index.js";
import { collectAiCalls } from "./ai-call-recording.js";
import { linkableQuantityOrNull, readingOrUnavailable } from "./proposed-quantity.js";
import type { SupplierItemLinkProposalReader } from "./supplier-item-link-proposal-reader.js";
import type { SupplierItemQuantityReader } from "./supplier-item-quantity-reader.js";
import type { SupplierPriceListAiCallStore } from "./supplier-price-list-ai-call-store.js";

export interface ProposeSupplierItemQuantityPorts {
  reader: SupplierItemLinkProposalReader;
  quantityReader: SupplierItemQuantityReader;
  aiCalls: SupplierPriceListAiCallStore;
  zoneRules: ZoneRulesSource;
}

export interface ProposeSupplierItemQuantityInput {
  listId: string;
  rowId: string;
  actorId: string;
  now: () => Date;
  saleUnit: SaleUnit;
  netContent: { quantity: number; unit: NetContentUnit } | null;
}

export type ProposeSupplierItemQuantityOutcome =
  | { kind: "not_found" }
  // In thousandths of the sale unit.
  | { kind: "proposed"; quantity: number }
  | { kind: "none" }
  | { kind: "unavailable" };

// A proposal is never applied: the only thing written is what the AI call costs.
export async function proposeSupplierItemQuantity(
  { reader, quantityReader, aiCalls, zoneRules }: ProposeSupplierItemQuantityPorts,
  input: ProposeSupplierItemQuantityInput,
): Promise<ProposeSupplierItemQuantityOutcome> {
  const row = await reader.row(input.listId, input.rowId);
  if (!row) {
    return { kind: "not_found" };
  }

  const collector = collectAiCalls(input.now, zoneRules);
  const reading = await readingOrUnavailable(() =>
    quantityReader.read(
      {
        description: row.description,
        presentation: row.presentation,
        otherPresentations: row.otherPresentations,
      },
      { saleUnit: input.saleUnit, netContent: input.netContent },
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
  return quantity === null ? { kind: "none" } : { kind: "proposed", quantity };
}
