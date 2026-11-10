import { expect, test } from "vitest";
import {
  REPORT_VIEW_LABELS,
  REPORT_VIEW_TABS,
  REPORT_VIEW_TARGETS,
  REPORT_VIEW_TITLES,
  REPORT_VIEWS,
  REPORTS_TAB_LABELS,
  REPORTS_TABS,
  reportViewsOfTab,
} from "./reports-tabs";
import { accessWith } from "./test-support/backoffice-access";

function visibleTabs(...capabilities: Parameters<typeof accessWith>) {
  const access = accessWith(...capabilities);
  return REPORTS_TABS.filter((tab) => tab.isVisibleTo(access)).map((tab) => tab.key);
}

function visibleViews(...capabilities: Parameters<typeof accessWith>) {
  const access = accessWith(...capabilities);
  return REPORT_VIEWS.filter((view) => view.isVisibleTo(access)).map((view) => view.key);
}

const VIEWS_OF_THE_REPORTS_AREA = [
  "sales-by-day",
  "sales-by-payment-method",
  "sales-by-product-and-category",
  "sales-by-cashier",
  "average-ticket",
  "sales-by-promotion",
  "manual-discounts",
  "cash-rounding",
  "hand-typed-weights",
  "margin",
] as const;

test("shows the three tabs, in order, to a person with the reports area", () => {
  expect(visibleTabs("reports_area")).toEqual(["sales", "discounts", "profitability"]);
});

test("shows only Rentabilidad to a person with only the Mercado Pago charge costs", () => {
  expect(visibleTabs("mercado_pago_charge_costs")).toEqual(["profitability"]);
});

test("shows no tab without either capability", () => {
  expect(visibleTabs("branch_area", "stock_area")).toEqual([]);
});

test("shows every view but the Mercado Pago charge costs with the reports area", () => {
  expect(visibleViews("reports_area")).toEqual(VIEWS_OF_THE_REPORTS_AREA);
});

test("shows the Mercado Pago charge costs last, after the other views, with both capabilities", () => {
  expect(visibleViews("reports_area", "mercado_pago_charge_costs")).toEqual([
    ...VIEWS_OF_THE_REPORTS_AREA,
    "mercado-pago-charge-costs",
  ]);
});

test("shows only the Mercado Pago charge costs with only its capability", () => {
  expect(visibleViews("mercado_pago_charge_costs")).toEqual(["mercado-pago-charge-costs"]);
});

test("groups the views into their tabs", () => {
  expect(REPORT_VIEW_TABS).toEqual({
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
  });
});

test("lists the views of a tab in the order the page declares them", () => {
  const views = visibleViews("reports_area", "mercado_pago_charge_costs");

  expect(reportViewsOfTab(views, "sales")).toEqual([
    "sales-by-day",
    "sales-by-payment-method",
    "sales-by-product-and-category",
    "sales-by-cashier",
    "average-ticket",
  ]);
  expect(reportViewsOfTab(views, "discounts")).toEqual([
    "sales-by-promotion",
    "manual-discounts",
    "cash-rounding",
    "hand-typed-weights",
  ]);
  expect(reportViewsOfTab(views, "profitability")).toEqual(["margin", "mercado-pago-charge-costs"]);
});

test("lists only the views the person may see in a tab", () => {
  expect(reportViewsOfTab(["margin"], "sales")).toEqual([]);
  expect(reportViewsOfTab(["margin"], "profitability")).toEqual(["margin"]);
});

test("keeps the address each view has always had", () => {
  expect(REPORT_VIEW_TARGETS).toEqual({
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
  });
});

test("names the tabs", () => {
  expect(REPORTS_TAB_LABELS).toEqual({
    sales: "Ventas",
    discounts: "Descuentos y control",
    profitability: "Rentabilidad",
  });
});

test("names each view in the segmented control", () => {
  expect(REPORT_VIEW_LABELS).toEqual({
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
  });
});

test("titles each view with its screen's title", () => {
  expect(REPORT_VIEW_TITLES).toEqual({
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
  });
});
