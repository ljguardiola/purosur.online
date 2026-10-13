import { formatNumber } from "./formatters";

export function formatTenthsOfPercent(tenths: number): string {
  const magnitude = formatNumber(Math.abs(tenths) / 10, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${tenths < 0 ? "−" : ""}${magnitude} %`;
}
