import {
  type StockPeriod,
  stockCountBodySchema,
  stockPeriodDaysSchema,
  stockPeriodSchema,
} from "@purosur/contracts";
import { formatDate, formatNumber, type Options } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

export type { StockPeriod };

export const STOCK_TIME_ZONE = schemaText(
  stockCountBodySchema.shape.occurredAt.meta()?.["timeZone"],
);

function periodOption(days: number) {
  return { value: stockPeriodSchema.parse(`${days}`), label: `Últimos ${formatNumber(days)} días` };
}

const [firstDays, ...otherDays] = stockPeriodDaysSchema.values;
if (firstDays === undefined) {
  throw new Error("The schema offers no stock period");
}

export const STOCK_PERIOD_OPTIONS: Options<ReturnType<typeof periodOption>> = [
  periodOption(firstDays),
  ...otherDays.map(periodOption),
];

export function periodDays(period: StockPeriod) {
  return stockPeriodDaysSchema.parse(Number(period));
}

export function formatStockDay(at: string): string {
  return formatDate(new Date(at), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: STOCK_TIME_ZONE,
  });
}

export function formatStockTime(at: string): string {
  return formatDate(new Date(at), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: STOCK_TIME_ZONE,
  });
}
