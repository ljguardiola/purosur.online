import { formatNumber, plural } from "@purosur/ui";

export function lossCountText(count: number): string {
  return plural(count, { one: "1 pérdida", other: `${formatNumber(count)} pérdidas` });
}
