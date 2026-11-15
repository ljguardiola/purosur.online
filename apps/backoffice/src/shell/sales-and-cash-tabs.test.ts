import { expect, test } from "vitest";
import { visibleAreaTabs } from "./area-tabs";
import { SALES_AND_CASH_TABS } from "./sales-and-cash-tabs";
import { accessWith } from "./test-support/backoffice-access";

function visibleTabs(...capabilities: Parameters<typeof accessWith>) {
  return visibleAreaTabs(SALES_AND_CASH_TABS, accessWith(...capabilities)).map((tab) => tab.key);
}

test("shows every tab, in order, to a person who sees the registers, the reports and the refunds", () => {
  expect(visibleTabs("registers_area", "reports_area", "refunds_area")).toEqual([
    "registers",
    "closes",
    "movements",
    "refunds",
  ]);
});

test.each(["registers_area", "fiscal_configuration_area", "backups_area"] as const)(
  "shows only Cajas with only %s",
  (capability) => {
    expect(visibleTabs(capability)).toEqual(["registers"]);
  },
);

test("shows the closes and the cash movements with only the reports", () => {
  expect(visibleTabs("reports_area")).toEqual(["closes", "movements"]);
});

test.each(["refunds_area", "returns_report"] as const)(
  "shows only Devoluciones y reembolsos with only %s",
  (capability) => {
    expect(visibleTabs(capability)).toEqual(["refunds"]);
  },
);

test("shows no tab without any of those capabilities", () => {
  expect(visibleTabs("stock_area")).toEqual([]);
});

test("labels each tab and gives it its own address", () => {
  expect(SALES_AND_CASH_TABS.map(({ key, label, to }) => ({ key, label, to }))).toEqual([
    { key: "registers", label: "Cajas", to: "/registers" },
    { key: "closes", label: "Cierres de caja", to: "/registers/closes" },
    { key: "movements", label: "Movimientos de efectivo", to: "/registers/movements" },
    { key: "refunds", label: "Devoluciones y reembolsos", to: "/refunds" },
  ]);
});
