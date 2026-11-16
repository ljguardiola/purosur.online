import { expect, test } from "vitest";
import { visibleAreaTabs } from "../shell/area-tabs";
import { accessWith } from "../shell/test-support/backoffice-access";
import { PURCHASING_TABS } from "./purchasing-area-tabs";

test("labels every Compras tab, in order, and gives it its own address", () => {
  const access = accessWith(
    "suppliers",
    "supplier_price_lists",
    "purchase_order_reads",
    "price_comparison",
    "purchases",
    "freights",
  );

  expect(visibleAreaTabs(PURCHASING_TABS, access)).toEqual([
    { key: "suppliers", label: "Proveedores", to: "/suppliers" },
    { key: "price-lists", label: "Listas de precios", to: "/suppliers/price-lists" },
    { key: "orders", label: "Pedidos", to: "/purchase-orders" },
    { key: "suggestion", label: "Sugerir pedido", to: "/purchase-orders/suggestion" },
    { key: "comparison", label: "Comparar precios", to: "/purchase-orders/comparison" },
    { key: "purchases", label: "Compras registradas", to: "/purchases" },
    { key: "freights", label: "Fletes", to: "/purchases/freights" },
  ]);
});

test.each([
  ["suppliers", ["suppliers"]],
  ["supplier_price_lists", ["price-lists"]],
  ["purchase_order_reads", ["orders"]],
  ["price_comparison", ["suggestion", "comparison"]],
  ["purchases", ["purchases"]],
  ["freights", ["freights"]],
] as const)("keeps each tab's own visibility: with only %s it shows %j", (capability, tabs) => {
  expect(visibleAreaTabs(PURCHASING_TABS, accessWith(capability)).map((tab) => tab.key)).toEqual(
    tabs,
  );
});
