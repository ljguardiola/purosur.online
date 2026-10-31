import { productLinkCandidates } from "../../catalog/index.js";
import type { ZoneRulesSource } from "../../shared/index.js";
import { type AiCallCollector, collectAiCalls } from "./ai-call-recording.js";
import type { ProductChoice, ProductChoiceItem, ProductChooser } from "./product-chooser.js";
import { linkableQuantityOrNull, readingOrUnavailable } from "./proposed-quantity.js";
import type {
  ProposalProduct,
  SupplierItemLinkProposalReader,
} from "./supplier-item-link-proposal-reader.js";
import type { SupplierItemQuantityReader } from "./supplier-item-quantity-reader.js";
import type { SupplierPriceListAiCallStore } from "./supplier-price-list-ai-call-store.js";

export interface ProposeSupplierItemLinkPorts {
  reader: SupplierItemLinkProposalReader;
  chooser: ProductChooser;
  quantityReader: SupplierItemQuantityReader;
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
  | {
      kind: "proposed";
      by: "barcode" | "ai";
      product: ProposalProduct;
      // In thousandths of the product's sale unit; null when it could not be told.
      quantity: number | null;
    }
  | { kind: "none" }
  | { kind: "unavailable" };

async function chosenOrUnavailable(
  chooser: ProductChooser,
  item: ProductChoiceItem,
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
  { reader, chooser, quantityReader, aiCalls, zoneRules }: ProposeSupplierItemLinkPorts,
  input: ProposeSupplierItemLinkInput,
): Promise<ProposeSupplierItemLinkOutcome> {
  const row = await reader.row(input.listId, input.rowId);
  if (!row) {
    return { kind: "not_found" };
  }

  const item = {
    description: row.description,
    presentation: row.presentation,
    otherPresentations: row.otherPresentations,
  };
  const collector = collectAiCalls(input.now, zoneRules);
  const recordCalls = async () => {
    const records = collector.records({
      purpose: "LINK_PROPOSAL",
      listId: input.listId,
      rowId: input.rowId,
      actorId: input.actorId,
    });
    if (records.length > 0) {
      await aiCalls.record(records);
    }
  };

  if (row.barcode !== null) {
    const [only, ...others] = await reader.activeProductsWithBarcode(row.barcode);
    if (only && others.length === 0) {
      const reading = await readingOrUnavailable(() =>
        quantityReader.read(
          item,
          { saleUnit: only.saleUnit, netContent: only.netContent },
          collector.onCall,
        ),
      );
      await recordCalls();
      return {
        kind: "proposed",
        by: "barcode",
        product: only,
        quantity:
          reading.kind === "read" ? linkableQuantityOrNull(only.saleUnit, reading.quantity) : null,
      };
    }
  }

  const candidates = productLinkCandidates(
    await reader.activeProducts(),
    [row.description, row.presentation].join(" "),
  );
  if (candidates.length === 0) {
    return { kind: "none" };
  }

  const choice = await chosenOrUnavailable(chooser, item, candidates, collector);
  await recordCalls();
  if (choice.kind === "unavailable") {
    return choice;
  }
  const product =
    choice.kind === "chosen"
      ? candidates.find((candidate) => candidate.id === choice.productId)
      : undefined;
  return choice.kind === "chosen" && product
    ? {
        kind: "proposed",
        by: "ai",
        product,
        quantity: linkableQuantityOrNull(product.saleUnit, choice.quantity),
      }
    : { kind: "none" };
}
