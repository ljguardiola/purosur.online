import { Tab, Tabs } from "@purosur/ui";
import { createLink, getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTopBar } from "./area-top-bar";
import { useDocumentTitle } from "./document-title";
import type { RefundsTab } from "./refunds-tabs";
import { ScreenLayout } from "./screen-layout";

const route = getRouteApi("/signed-in/sales-and-cash-area/refunds");

const RefundsTabLink = createLink(Tab);

const TAB_LABELS: Record<RefundsTab, string> = { pending: "Pendientes", history: "Historial" };

export function RefundsPage(): ReactElement {
  const { refundsTabs } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Devoluciones y reembolsos · Puro Sur");
  const selectedTab: RefundsTab = matchRoute({ to: "/refunds/history" }) ? "history" : "pending";

  return (
    <ScreenLayout
      topBar={<AreaTopBar eyebrow="Ventas y caja" title="Devoluciones y reembolsos" />}
      bodyClassName="p-0"
    >
      <Tabs
        label="Secciones de Devoluciones y reembolsos"
        selectedTab={selectedTab}
        tabs={refundsTabs.map((key) => (
          <RefundsTabLink
            key={key}
            to={key === "pending" ? "/refunds" : "/refunds/history"}
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
