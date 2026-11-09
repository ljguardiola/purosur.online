import { Tab, Tabs } from "@purosur/ui";
import { createLink, getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTopBar } from "../shell/area-top-bar";
import { useDocumentTitle } from "../shell/document-title";
import { ScreenLayout } from "../shell/screen-layout";
import { PURCHASES_TAB_TARGETS, type PurchasesTab } from "./purchases-tabs";

const route = getRouteApi("/signed-in/purchasing-area/purchases");

const PurchasesTabLink = createLink(Tab);

const TAB_LABELS: Record<PurchasesTab, string> = {
  purchases: "Compras",
  freights: "Fletes",
};

export function PurchasesPage(): ReactElement {
  const { purchasesTabs } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Compras · Puro Sur");
  const selectedTab: PurchasesTab = matchRoute({ to: "/purchases/freights" })
    ? "freights"
    : "purchases";

  return (
    <ScreenLayout topBar={<AreaTopBar title="Compras" />} bodyClassName="p-0">
      <Tabs
        label="Secciones de Compras"
        selectedTab={selectedTab}
        tabs={purchasesTabs.map((key) => (
          <PurchasesTabLink
            key={key}
            to={PURCHASES_TAB_TARGETS[key]}
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
