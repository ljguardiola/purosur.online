import { getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTabs } from "./area-tab-row";
import { AreaTopBar } from "./area-top-bar";
import { useDocumentTitle } from "./document-title";
import type { RegistersTab } from "./registers-tabs";
import { ScreenLayout } from "./screen-layout";

const route = getRouteApi("/signed-in/sales-and-cash-area/registers");

export function RegistersPage(): ReactElement {
  const { salesAndCashTabs } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Cajas · Puro Sur");
  const selectedTab: RegistersTab = matchRoute({ to: "/registers/closes" })
    ? "closes"
    : matchRoute({ to: "/registers/movements" })
      ? "movements"
      : "registers";

  return (
    <ScreenLayout topBar={<AreaTopBar title="Ventas y caja" />} bodyClassName="p-0">
      <AreaTabs area="Ventas y caja" tabs={salesAndCashTabs} selected={selectedTab}>
        <Outlet />
      </AreaTabs>
    </ScreenLayout>
  );
}
