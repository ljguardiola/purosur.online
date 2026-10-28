export function barcodesSummary(barcodes: readonly string[]): string {
  const [first, ...others] = barcodes;
  if (first === undefined) {
    return "";
  }
  return others.length === 0 ? first : `${first} +${others.length}`;
}
