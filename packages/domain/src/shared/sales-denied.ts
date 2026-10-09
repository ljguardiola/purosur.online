export const SALES_DENIED_REASONS = ["event_history_broken"] as const;

export type SalesDeniedReason = (typeof SALES_DENIED_REASONS)[number];

export type SalesDeniedReport =
  | { sales_denied?: undefined; sales_denied_reason?: undefined }
  | { sales_denied: false; sales_denied_reason?: undefined }
  | { sales_denied: true; sales_denied_reason: SalesDeniedReason };
