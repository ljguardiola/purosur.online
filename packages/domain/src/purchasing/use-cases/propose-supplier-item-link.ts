import { productLinkCandidates } from "../../catalog/index.js";
import type { ProductChoice, ProductChooser } from "./product-chooser.js";
import type {
  ProposalProduct,
  SupplierItemLinkProposalReader,
} from "./supplier-item-link-proposal-reader.js";

export interface ProposeSupplierItemLinkPorts {
  reader: SupplierItemLinkProposalReader;
  chooser: ProductChooser;
}

export interface ProposeSupplierItemLinkInput {
  listId: string;
  rowId: string;
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
): Promise<ProductChoice> {
  try {
    return await chooser.choose(item, candidates);
  } catch {
    return { kind: "unavailable" };
  }
}

// A proposal is never applied: nothing is written.
export async function proposeSupplierItemLink(
  { reader, chooser }: ProposeSupplierItemLinkPorts,
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

  const choice = await chosenOrUnavailable(
    chooser,
    { description: row.description, presentation: row.presentation },
    candidates,
  );
  if (choice.kind === "unavailable") {
    return choice;
  }
  const product =
    choice.kind === "chosen"
      ? candidates.find((candidate) => candidate.id === choice.productId)
      : undefined;
  return product ? { kind: "proposed", by: "ai", product } : { kind: "none" };
}
