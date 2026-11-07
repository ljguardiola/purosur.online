import type { ProductChoiceItem } from "./product-chooser.js";
import type { ProposalRow } from "./supplier-item-link-proposal-reader.js";

export function isSameProposalItem(kept: ProductChoiceItem, current: ProductChoiceItem): boolean {
  const currentPresentations = new Set(current.otherPresentations);
  return (
    kept.description === current.description &&
    kept.presentation === current.presentation &&
    kept.otherPresentations.length === currentPresentations.size &&
    kept.otherPresentations.every((presentation) => currentPresentations.has(presentation))
  );
}

export function isSameProposalRow(kept: ProposalRow, current: ProposalRow): boolean {
  return kept.barcode === current.barcode && isSameProposalItem(kept, current);
}
