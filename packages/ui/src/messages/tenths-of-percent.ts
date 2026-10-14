import { formatNumber } from "./formatters";

export function formatTenthsOfPercent(tenths: number): string {
  const magnitude = formatNumber(Math.abs(tenths) / 10, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${tenths < 0 ? "−" : ""}${magnitude} %`;
}

export function formatSignedTenthsOfPercent(tenths: number): string {
  return tenths > 0 ? `+ ${formatTenthsOfPercent(tenths)}` : formatTenthsOfPercent(tenths);
}
