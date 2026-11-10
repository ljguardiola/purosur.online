import { isRedirect } from "@tanstack/react-router";
import { expect, test } from "vitest";
import { reportViewRedirect } from "./reports-route";
import type { ReportView } from "./reports-tabs";
import { FRONT_REGISTER_ID } from "./test-support/report-fixtures";

const VIEWS_OF_THE_REPORTS_AREA: readonly ReportView[] = [
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
];

function redirectOf(views: readonly ReportView[], own: ReportView, search: object = {}) {
  try {
    reportViewRedirect(views, own, search);
  } catch (thrown) {
    if (isRedirect(thrown)) {
      return { to: thrown.options.to, search: thrown.options.search };
    }
    throw thrown;
  }
  return null;
}

test("lets a person open a view they may see", () => {
  expect(redirectOf(VIEWS_OF_THE_REPORTS_AREA, "cash-rounding")).toBeNull();
});

test("sends a person from a view they may not see to the first view of its tab", () => {
  expect(redirectOf(VIEWS_OF_THE_REPORTS_AREA, "mercado-pago-charge-costs")).toEqual({
    to: "/reports/margin",
    search: {},
  });
});

test("sends a person with no view in the tab to the first view they may see", () => {
  expect(redirectOf(["mercado-pago-charge-costs"], "sales-by-cashier")).toEqual({
    to: "/reports/mercado-pago-charge-costs",
    search: {},
  });
});

test("sends a person with no view at all to Ventas > Por día", () => {
  expect(redirectOf([], "margin")).toEqual({ to: "/reports/sales-by-day", search: {} });
});

test("keeps only the period and the register when it sends the person to another view", () => {
  expect(
    redirectOf(VIEWS_OF_THE_REPORTS_AREA, "mercado-pago-charge-costs", {
      from: "2026-10-01",
      to: "2026-10-07",
      register: FRONT_REGISTER_ID,
      view: "charges",
    }),
  ).toEqual({
    to: "/reports/margin",
    search: { from: "2026-10-01", to: "2026-10-07", register: FRONT_REGISTER_ID },
  });
});
