import { productLinkCandidates } from "../../catalog/index.js";
import type { ZoneRulesSource } from "../../shared/index.js";
import { PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO } from "../model/supplier-item.js";
import { type AiCallCollector, collectAiCalls } from "./ai-call-recording.js";
import type { ProductChoice, ProductChoiceItem, ProductChooser } from "./product-chooser.js";
import { isSameProposalRow } from "./proposal-asked-from.js";
import { linkableQuantityOrNull, readingOrUnavailable } from "./proposed-quantity.js";
import type {
  ProposalProduct,
  SupplierItemLinkProposalReader,
} from "./supplier-item-link-proposal-reader.js";
import type {
  LinkProposalAnswer,
  SupplierItemProposalStore,
} from "./supplier-item-proposal-store.js";
import type { SupplierItemQuantityReader } from "./supplier-item-quantity-reader.js";

export interface ProposeSupplierItemLinkPorts {
  reader: SupplierItemLinkProposalReader;
  chooser: ProductChooser;
  quantityReader: SupplierItemQuantityReader;
  store: SupplierItemProposalStore;
  zoneRules: ZoneRulesSource;
}

export interface ProposeSupplierItemLinkInput {
  listId: string;
  rowId: string;
  actorId: string;
  now: () => Date;
  // Asks the AI again even when a proposal is kept for the row.
  refresh: boolean;
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

async function shownKeptProposal(
  reader: SupplierItemLinkProposalReader,
  answer: LinkProposalAnswer,
): Promise<ProposeSupplierItemLinkOutcome> {
  if (answer.kind === "none") {
    return answer;
  }
  const product = await reader.product(answer.productId, PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO);
  if (!product) {
    return { kind: "none" };
  }
  return {
    kind: "proposed",
    by: answer.by,
    product,
    quantity: product.saleUnit === answer.saleUnit ? answer.quantity : null,
  };
}

// A proposal is never applied: what is written is what the AI calls cost and the proposals a call produced.
export async function proposeSupplierItemLink(
  { reader, chooser, quantityReader, store, zoneRules }: ProposeSupplierItemLinkPorts,
  input: ProposeSupplierItemLinkInput,
): Promise<ProposeSupplierItemLinkOutcome> {
  const row = await reader.row(input.listId, input.rowId);
  if (!row) {
    return { kind: "not_found" };
  }

  if (!input.refresh) {
    const kept = await store.keptLinkProposal(input.rowId);
    if (kept && isSameProposalRow(kept.askedFrom, row)) {
      return shownKeptProposal(reader, kept.answer);
    }
  }

  const item = {
    description: row.description,
    presentation: row.presentation,
    otherPresentations: row.otherPresentations,
  };
  const collector = collectAiCalls(input.now, zoneRules);
  const recorded = async (
    outcome: ProposeSupplierItemLinkOutcome,
    answer: LinkProposalAnswer | null,
  ): Promise<ProposeSupplierItemLinkOutcome> => {
    const recording = await store.recordLinkProposal(
      input.rowId,
      collector.records({
        purpose: "LINK_PROPOSAL",
        listId: input.listId,
        rowId: input.rowId,
        actorId: input.actorId,
      }),
      answer && { askedFrom: row, answer },
    );
    return recording === "row_gone" ? { kind: "not_found" } : outcome;
  };

  if (row.barcode !== null) {
    const [only, ...others] = await reader.productsWithBarcode(
      row.barcode,
      PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO,
    );
    if (only && others.length === 0) {
      const reading = await readingOrUnavailable(() =>
        quantityReader.read(
          item,
          { saleUnit: only.saleUnit, netContent: only.netContent },
          collector.onCall,
        ),
      );
      const quantity =
        reading.kind === "read" ? linkableQuantityOrNull(only.saleUnit, reading.quantity) : null;
      return recorded(
        { kind: "proposed", by: "barcode", product: only, quantity },
        reading.kind === "unavailable"
          ? null
          : {
              kind: "proposed",
              by: "barcode",
              productId: only.id,
              saleUnit: only.saleUnit,
              quantity,
            },
      );
    }
  }

  const candidates = productLinkCandidates(
    await reader.products(PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO),
    [row.description, row.presentation].join(" "),
  );
  if (candidates.length === 0) {
    return { kind: "none" };
  }

  const choice = await chosenOrUnavailable(chooser, item, candidates, collector);
  if (choice.kind === "unavailable") {
    return recorded(choice, null);
  }
  if (choice.kind === "chosen") {
    const product = candidates.find((candidate) => candidate.id === choice.productId);
    if (product) {
      const quantity = linkableQuantityOrNull(product.saleUnit, choice.quantity);
      return recorded(
        { kind: "proposed", by: "ai", product, quantity },
        { kind: "proposed", by: "ai", productId: product.id, saleUnit: product.saleUnit, quantity },
      );
    }
  }
  return recorded({ kind: "none" }, { kind: "none" });
}
