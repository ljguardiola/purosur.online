const SPANISH_TEXT_ORDER = new Intl.Collator("es-AR", { numeric: true });

export function compareSpanishText(a: string, b: string): number {
  return SPANISH_TEXT_ORDER.compare(a, b);
}

export function compareOptionalNames(a: string | null, b: string | null): number {
  if (a === null || b === null) {
    return Number(a === null) - Number(b === null);
  }
  return compareSpanishText(a, b);
}

export function compareSpanishPaths(a: readonly string[], b: readonly string[]): number {
  const [firstOfA, ...restOfA] = a;
  const [firstOfB, ...restOfB] = b;
  if (firstOfA === undefined || firstOfB === undefined) {
    return a.length - b.length;
  }
  return compareSpanishText(firstOfA, firstOfB) || compareSpanishPaths(restOfA, restOfB);
}

export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
