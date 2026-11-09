export const REPORT_GROUPS = ["product", "category"] as const;

export type ReportGroup = (typeof REPORT_GROUPS)[number];
