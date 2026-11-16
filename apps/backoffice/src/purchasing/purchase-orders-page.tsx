import { getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTopBar } from "../shell/area-top-bar";
import { useDocumentTitle } from "../shell/document-title";
import { ScreenLayout } from "../shell/screen-layout";
import type { PurchaseOrdersTab } from "./purchase-orders-tabs";
import { PurchasingTabs } from "./purchasing-tabs";

const route = getRouteApi("/signed-in/purchasing-area/purchase-orders");

export function PurchaseOrdersPage(): ReactElement {
  const { purchasingTabs } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Pedidos · Puro Sur");
  const selectedTab: PurchaseOrdersTab = matchRoute({ to: "/purchase-orders/suggestion" })
    ? "suggestion"
    : matchRoute({ to: "/purchase-orders/comparison" })
      ? "comparison"
      : "orders";

  return (
    <ScreenLayout topBar={<AreaTopBar title="Compras" />} bodyClassName="p-0">
      <PurchasingTabs tabs={purchasingTabs} selected={selectedTab}>
        <Outlet />
      </PurchasingTabs>
    </ScreenLayout>
  );
}
