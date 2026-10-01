export interface BuyerTaxStatusOption {
  code: number;
  description: string;
  invoiceClass: string;
}

export function isValidBuyerTaxStatusSet(options: readonly BuyerTaxStatusOption[]): boolean {
  return (
    options.length > 0 && new Set(options.map((option) => option.code)).size === options.length
  );
}

function canonical(options: readonly BuyerTaxStatusOption[]): string[] {
  return options
    .map((option) => JSON.stringify([option.code, option.description, option.invoiceClass]))
    .sort();
}

export function isSameBuyerTaxStatusSet(
  left: readonly BuyerTaxStatusOption[],
  right: readonly BuyerTaxStatusOption[],
): boolean {
  const leftCanonical = canonical(left);
  const rightCanonical = canonical(right);
  return (
    leftCanonical.length === rightCanonical.length &&
    leftCanonical.every((option, index) => option === rightCanonical[index])
  );
}

export function latestBuyerTaxStatusSet<TSet extends { paramsVersion: number }>(
  sets: readonly TSet[],
): TSet | undefined {
  return [...sets].sort((a, b) => b.paramsVersion - a.paramsVersion)[0];
}
