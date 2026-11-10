import type { PagePart } from "../platform/page-parts";
import {
  type BackofficeAccess,
  canSeeMercadoPagoChargeCosts,
  canSeeReports,
} from "./backoffice-access";

export type ReportsTab = "sales" | "discounts" | "profitability";

export type ReportView =
  | "sales-by-day"
  | "sales-by-payment-method"
  | "sales-by-product-and-category"
  | "sales-by-cashier"
  | "average-ticket"
  | "sales-by-promotion"
  | "manual-discounts"
  | "cash-rounding"
  | "hand-typed-weights"
  | "margin"
  | "mercado-pago-charge-costs";

export const REPORT_VIEWS: readonly PagePart<BackofficeAccess, ReportView>[] = [
  { key: "sales-by-day", isVisibleTo: canSeeReports },
  { key: "sales-by-payment-method", isVisibleTo: canSeeReports },
  { key: "sales-by-product-and-category", isVisibleTo: canSeeReports },
  { key: "sales-by-cashier", isVisibleTo: canSeeReports },
  { key: "average-ticket", isVisibleTo: canSeeReports },
  { key: "sales-by-promotion", isVisibleTo: canSeeReports },
  { key: "manual-discounts", isVisibleTo: canSeeReports },
  { key: "cash-rounding", isVisibleTo: canSeeReports },
  { key: "hand-typed-weights", isVisibleTo: canSeeReports },
  { key: "margin", isVisibleTo: canSeeReports },
  { key: "mercado-pago-charge-costs", isVisibleTo: canSeeMercadoPagoChargeCosts },
];

export const REPORT_VIEW_TABS: Record<ReportView, ReportsTab> = {
  "sales-by-day": "sales",
  "sales-by-payment-method": "sales",
  "sales-by-product-and-category": "sales",
  "sales-by-cashier": "sales",
  "average-ticket": "sales",
  "sales-by-promotion": "discounts",
  "manual-discounts": "discounts",
  "cash-rounding": "discounts",
  "hand-typed-weights": "discounts",
  margin: "profitability",
  "mercado-pago-charge-costs": "profitability",
};

export const REPORTS_TABS: readonly PagePart<BackofficeAccess, ReportsTab>[] = (
  ["sales", "discounts", "profitability"] as const
).map((key) => ({
  key,
  isVisibleTo: (access) =>
    REPORT_VIEWS.some((view) => REPORT_VIEW_TABS[view.key] === key && view.isVisibleTo(access)),
}));

export function reportViewsOfTab(views: readonly ReportView[], tab: ReportsTab): ReportView[] {
  return views.filter((view) => REPORT_VIEW_TABS[view] === tab);
}

export const REPORT_VIEW_TARGETS = {
  "sales-by-day": "/reports/sales-by-day",
  "sales-by-payment-method": "/reports/sales-by-payment-method",
  "sales-by-product-and-category": "/reports/sales-by-product-and-category",
  "sales-by-cashier": "/reports/sales-by-cashier",
  "average-ticket": "/reports/average-ticket",
  "sales-by-promotion": "/reports/sales-by-promotion",
  "manual-discounts": "/reports/manual-discounts",
  "cash-rounding": "/reports/cash-rounding",
  "hand-typed-weights": "/reports/hand-typed-weights",
  margin: "/reports/margin",
  "mercado-pago-charge-costs": "/reports/mercado-pago-charge-costs",
} as const satisfies Record<ReportView, string>;

export const REPORTS_TAB_LABELS: Record<ReportsTab, string> = {
  sales: "Ventas",
  discounts: "Descuentos y control",
  profitability: "Rentabilidad",
};

export const REPORT_VIEW_LABELS: Record<ReportView, string> = {
  "sales-by-day": "Por día",
  "sales-by-payment-method": "Por medio de pago",
  "sales-by-product-and-category": "Por producto y categoría",
  "sales-by-cashier": "Por cajero",
  "average-ticket": "Ticket promedio",
  "sales-by-promotion": "Por promoción",
  "manual-discounts": "Manuales y sobre el total",
  "cash-rounding": "Redondeo en efectivo",
  "hand-typed-weights": "Pesos tipeados a mano",
  margin: "Margen por producto y categoría",
  "mercado-pago-charge-costs": "Costos de Mercado Pago",
};

export const REPORT_VIEW_TITLES: Record<ReportView, string> = {
  "sales-by-day": "Ventas por día o por rango",
  "sales-by-payment-method": "Ventas por medio de pago",
  "sales-by-product-and-category": "Ventas por producto y por categoría",
  "sales-by-cashier": "Ventas por cajero",
  "average-ticket": "Ticket promedio",
  "sales-by-promotion": "Descuentos por promoción",
  "manual-discounts": "Descuentos manuales y sobre el total",
  "cash-rounding": "Redondeo en efectivo",
  "hand-typed-weights": "Pesos tipeados a mano",
  margin: "Margen por producto y por categoría",
  "mercado-pago-charge-costs": "Costos de Mercado Pago",
};
