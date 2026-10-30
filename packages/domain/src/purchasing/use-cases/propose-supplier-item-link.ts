import { productLinkCandidates } from "../../catalog/index.js";
import type { ZoneRulesSource } from "../../shared/index.js";
import { type AiCallCollector, collectAiCalls } from "./ai-call-recording.js";
import type { ProductChoice, ProductChooser } from "./product-chooser.js";
import type {
  ProposalProduct,
  SupplierItemLinkProposalReader,
} from "./supplier-item-link-proposal-reader.js";
import type { SupplierPriceListAiCallStore } from "./supplier-price-list-ai-call-store.js";

export interface ProposeSupplierItemLinkPorts {
  reader: SupplierItemLinkProposalReader;
  chooser: ProductChooser;
  aiCalls: SupplierPriceListAiCallStore;
  zoneRules: ZoneRulesSource;
}

export interface ProposeSupplierItemLinkInput {
  listId: string;
  rowId: string;
  actorId: string;
  now: () => Date;
}

export type ProposeSupplierItemLinkOutcome =
  | { kind: "not_found" }
  | { kind: "proposed"; by: "barcode" | "ai"; product: ProposalProduct }
  | { kind: "none" }
  | { kind: "unavailable" };

async function chosenOrUnavailable(
  chooser: ProductChooser,
  item: { description: string; presentation: string | null },
  candidates: ProposalProduct[],
  aiCalls: AiCallCollector,
): Promise<ProductChoice> {
  try {
    return await chooser.choose(item, candidates, aiCalls.onCall);
  } catch {
    return { kind: "unavailable" };
  }
}

// A proposal is never applied: the only thing written is what the AI calls cost.
export async function proposeSupplierItemLink(
  { reader, chooser, aiCalls, zoneRules }: ProposeSupplierItemLinkPorts,
  input: ProposeSupplierItemLinkInput,
): Promise<ProposeSupplierItemLinkOutcome> {
  const row = await reader.row(input.listId, input.rowId);
  if (!row) {
    return { kind: "not_found" };
  }

  if (row.barcode !== null) {
    const [only, ...others] = await reader.activeProductsWithBarcode(row.barcode);
    if (only && others.length === 0) {
      return { kind: "proposed", by: "barcode", product: only };
    }
  }

  const candidates = productLinkCandidates(
    await reader.activeProducts(),
    [row.description, row.presentation].join(" "),
  );
  if (candidates.length === 0) {
    return { kind: "none" };
  }

  const collector = collectAiCalls(input.now, zoneRules);
  const choice = await chosenOrUnavailable(
    chooser,
    { description: row.description, presentation: row.presentation },
    candidates,
    collector,
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
  if (choice.kind === "unavailable") {
    return choice;
  }
  const product =
    choice.kind === "chosen"
      ? candidates.find((candidate) => candidate.id === choice.productId)
      : undefined;
  return product ? { kind: "proposed", by: "ai", product } : { kind: "none" };
}
