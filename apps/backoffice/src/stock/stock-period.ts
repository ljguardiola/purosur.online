import type { StockPeriodDays } from "@purosur/contracts";
import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { formatDate } from "@purosur/ui";

export type StockPeriod = "7" | "30" | "90";

export const STOCK_PERIOD_OPTIONS = [
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
] as const satisfies readonly { value: StockPeriod; label: string }[];

export function periodDays(period: StockPeriod): StockPeriodDays {
  return Number(period) as StockPeriodDays;
}

export function formatStockDay(at: string): string {
  return formatDate(new Date(at), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ARGENTINA_TIME_ZONE,
  });
}

export function formatStockTime(at: string): string {
  return formatDate(new Date(at), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ARGENTINA_TIME_ZONE,
  });
}
