export type EsArNumberDigits = { whole: string; fraction: string };

// Argentine format: comma is the only decimal separator; a dot only groups thousands, in valid
// 3-digit groups with no leading zero — elsewhere it's rejected, not misread as a decimal point.
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
