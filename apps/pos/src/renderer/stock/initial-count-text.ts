import type { InitialCountLine } from "@purosur/contracts";
import { formatNumber, formatWeight, plural } from "@purosur/ui";

const THOUSANDTHS_PER_UNIT = 1000;

export function countedText({
  sale_unit,
  counted,
}: Pick<InitialCountLine, "sale_unit" | "counted">) {
  return sale_unit === "KG"
    ? formatWeight(counted)
    : `${formatNumber(counted / THOUSANDTHS_PER_UNIT)} u`;
}

export function linesText(count: number): string {
  return plural(count, { one: "1 línea", other: `${formatNumber(count)} líneas` });
}

export function summaryOf(lines: readonly InitialCountLine[]) {
  const withExpiry = lines.filter((line) => line.expires_on !== null).length;
  return {
    lines: lines.length,
    products: new Set(lines.map((line) => line.product_id)).size,
    withExpiry,
    withoutExpiry: lines.length - withExpiry,
  };
}
