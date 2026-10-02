export const STOCK_PERIOD_DAYS = [7, 30, 90] as const;

export type StockPeriodDays = (typeof STOCK_PERIOD_DAYS)[number];

export const DEFAULT_STOCK_PERIOD_DAYS: StockPeriodDays = 30;
