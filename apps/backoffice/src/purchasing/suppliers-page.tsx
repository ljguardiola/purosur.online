import { Tab, Tabs } from "@purosur/ui";
import { createLink, getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTopBar } from "../shell/area-top-bar";
import { useDocumentTitle } from "../shell/document-title";
import { ScreenLayout } from "../shell/screen-layout";
import { SUPPLIERS_TAB_TARGETS, type SuppliersTab } from "./suppliers-tabs";

const route = getRouteApi("/signed-in/purchasing-area/suppliers");

const SuppliersTabLink = createLink(Tab);

const TAB_LABELS: Record<SuppliersTab, string> = {
  suppliers: "Proveedores",
  "price-lists": "Listas de precios",
};

export function SuppliersPage(): ReactElement {
  const { suppliersTabs } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Proveedores · Puro Sur");
  const selectedTab: SuppliersTab = matchRoute({ to: "/suppliers/price-lists" })
    ? "price-lists"
    : "suppliers";

  return (
    <ScreenLayout topBar={<AreaTopBar eyebrow="Compras" title="Proveedores" />} bodyClassName="p-0">
      <Tabs
        label="Secciones de Proveedores"
        selectedTab={selectedTab}
        tabs={suppliersTabs.map((key) => (
          <SuppliersTabLink
            key={key}
            to={SUPPLIERS_TAB_TARGETS[key]}
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
