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

type ChosenOrder = {
  packages: number;
  packageQuantity: number;
  saleUnit: SuggestedLine["saleUnit"];
  quantity: number;
};

export function chosenOrder(line: SuggestedLine, chosen: string | null): ChosenOrder | undefined {
  const offer = line.offers.find((candidate) => candidate.supplier.id === chosen);
  if (offer !== undefined) {
    const { packages, packageQuantity, saleUnit, quantity } = offer;
    return { packages, packageQuantity, saleUnit, quantity };
  }
  const unpriced = line.unpricedOffers.find((candidate) => candidate.supplier.id === chosen);
  if (unpriced === undefined || unpriced.order === null) {
    return undefined;
  }
  return {
    ...unpriced.order,
    packageQuantity: unpriced.packageQuantity,
    saleUnit: unpriced.saleUnit,
  };
}
