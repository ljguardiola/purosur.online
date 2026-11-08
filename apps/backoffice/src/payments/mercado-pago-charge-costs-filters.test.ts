import { expect, test } from "vitest";
import { mercadoPagoChargeCostsFilters } from "./mercado-pago-charge-costs-filters";

test("opens the report on no period, grouped by day", () => {
  expect(mercadoPagoChargeCostsFilters.parse({})).toEqual({ from: "", to: "", group: "day" });
});

test("keeps the period and the grouping a URL names", () => {
  const filters = { from: "2026-10-01", to: "2026-10-07", group: "register" };

  expect(mercadoPagoChargeCostsFilters.parse(filters)).toEqual(filters);
});

test.each(["day", "month", "method", "register"])("offers the grouping by %s", (group) => {
  expect(mercadoPagoChargeCostsFilters.parse({ group }).group).toBe(group);
});

test("falls back for a grouping the report does not offer", () => {
  expect(mercadoPagoChargeCostsFilters.parse({ group: "supplier" }).group).toBe("day");
  expect(mercadoPagoChargeCostsFilters.parse({ group: 3 }).group).toBe("day");
});

test("falls back to no period for one the cloud would refuse", () => {
  expect(
    mercadoPagoChargeCostsFilters.parse({ from: "2026-10-07", to: "2026-10-01", group: "month" }),
  ).toEqual({ from: "", to: "", group: "month" });
});
