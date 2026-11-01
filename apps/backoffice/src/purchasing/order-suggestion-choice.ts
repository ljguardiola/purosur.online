import type { OrderSuggestion } from "@purosur/contracts";

export const LEFT_OUT = "left-out";

type SuggestedLine = OrderSuggestion["lines"][number];

export function chosenSupplierId(
  line: SuggestedLine,
  draft: string | undefined,
  knownSupplierIds: ReadonlySet<string>,
): string | null {
  if (draft === LEFT_OUT) {
    return LEFT_OUT;
  }
  if (line.offers.length === 0) {
    return draft !== undefined && knownSupplierIds.has(draft) ? draft : null;
  }
  const offered = line.offers.find((offer) => offer.supplier.id === draft);
  return (offered ?? line.offers.find((offer) => offer.cheapest))?.supplier.id ?? null;
}
