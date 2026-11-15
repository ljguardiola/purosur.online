import { getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTopBar } from "../shell/area-top-bar";
import { useDocumentTitle } from "../shell/document-title";
import { ScreenLayout } from "../shell/screen-layout";
import type { PurchasesTab } from "./purchases-tabs";
import { PurchasingTabs } from "./purchasing-tabs";

const route = getRouteApi("/signed-in/purchasing-area/purchases");

export function PurchasesPage(): ReactElement {
  const { purchasingTabs } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Compras · Puro Sur");
  const selectedTab: PurchasesTab = matchRoute({ to: "/purchases/freights" })
    ? "freights"
    : "purchases";

  return (
    <ScreenLayout topBar={<AreaTopBar title="Compras" />} bodyClassName="p-0">
      <PurchasingTabs tabs={purchasingTabs} selected={selectedTab}>
        <Outlet />
      </PurchasingTabs>
    </ScreenLayout>
  );
}
