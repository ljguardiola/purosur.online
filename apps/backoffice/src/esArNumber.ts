export type EsArNumberDigits = { whole: string; fraction: string };

// Argentine format: the comma is the only decimal separator, and a dot only groups thousands, in
// valid 3-digit groups ("1.000", "12.345,5", "1.000.000"). A dot anywhere else ("1.5", "1.00",
// ".5") is rejected rather than read as a decimal point, which would turn "1.000" into 1. The
// first group can't start with a zero either ("0.500", "00.500"): a real thousands group never
// does, and a leading zero there is the same 1000x misreading.
function esArNumberPattern(maxDecimals: number): RegExp {
  const fraction = maxDecimals > 0 ? `(?:,(\\d{1,${maxDecimals}}))?` : "";
  return new RegExp(`^(\\d+|[1-9]\\d{0,2}(?:\\.\\d{3})+)${fraction}$`);
}

/** The whole and fraction digits of an Argentine-formatted number, kept as text so a caller can
 * scale them exactly (money into cents) instead of going through a binary fraction. */
export function parseEsArNumber(value: string, maxDecimals: number): EsArNumberDigits | undefined {
  const match = esArNumberPattern(maxDecimals).exec(value.trim());
  if (!match) {
    return undefined;
  }
  return { whole: (match[1] ?? "").replaceAll(".", ""), fraction: match[2] ?? "" };
}
