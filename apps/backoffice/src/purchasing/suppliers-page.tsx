import { getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTopBar } from "../shell/area-top-bar";
import { useDocumentTitle } from "../shell/document-title";
import { ScreenLayout } from "../shell/screen-layout";
import { PurchasingTabs } from "./purchasing-tabs";
import type { SuppliersTab } from "./suppliers-tabs";

const route = getRouteApi("/signed-in/purchasing-area/suppliers");

export function SuppliersPage(): ReactElement {
  const { purchasingTabs } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Proveedores · Puro Sur");
  const selectedTab: SuppliersTab = matchRoute({ to: "/suppliers/price-lists" })
    ? "price-lists"
    : "suppliers";

  return (
    <ScreenLayout topBar={<AreaTopBar title="Compras" />} bodyClassName="p-0">
      <PurchasingTabs tabs={purchasingTabs} selected={selectedTab}>
        <Outlet />
      </PurchasingTabs>
    </ScreenLayout>
  );
}
