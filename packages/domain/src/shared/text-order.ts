const SPANISH_TEXT_ORDER = new Intl.Collator("es-AR");

export function compareSpanishText(a: string, b: string): number {
  return SPANISH_TEXT_ORDER.compare(a, b);
}

export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
