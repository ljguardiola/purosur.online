import { Tab, Tabs } from "@purosur/ui";
import { createLink, getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTopBar } from "../shell/area-top-bar";
import { useDocumentTitle } from "../shell/document-title";
import { ScreenLayout } from "../shell/screen-layout";
import { PURCHASE_ORDERS_TAB_TARGETS, type PurchaseOrdersTab } from "./purchase-orders-tabs";

const route = getRouteApi("/signed-in/purchasing-area/purchase-orders");

const PurchaseOrdersTabLink = createLink(Tab);

const TAB_LABELS: Record<PurchaseOrdersTab, string> = {
  orders: "Pedidos",
  suggestion: "Sugerir pedido",
  comparison: "Comparar precios",
};

export function PurchaseOrdersPage(): ReactElement {
  const { purchaseOrdersTabs } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Pedidos · Puro Sur");
  const selectedTab: PurchaseOrdersTab = matchRoute({ to: "/purchase-orders/suggestion" })
    ? "suggestion"
    : matchRoute({ to: "/purchase-orders/comparison" })
      ? "comparison"
      : "orders";

  return (
    <ScreenLayout topBar={<AreaTopBar title="Pedidos" />} bodyClassName="p-0">
      <Tabs
        label="Secciones de Pedidos"
        selectedTab={selectedTab}
        tabs={purchaseOrdersTabs.map((key) => (
          <PurchaseOrdersTabLink
            key={key}
            to={PURCHASE_ORDERS_TAB_TARGETS[key]}
            search={key === selectedTab ? true : {}}
            value={key}
            label={TAB_LABELS[key]}
          />
        ))}
      >
        <Outlet />
      </Tabs>
    </ScreenLayout>
  );
}
