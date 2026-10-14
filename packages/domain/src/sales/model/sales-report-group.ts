export const SALES_REPORT_GROUPS = ["product", "category"] as const;

export type SalesReportGroup = (typeof SALES_REPORT_GROUPS)[number];
