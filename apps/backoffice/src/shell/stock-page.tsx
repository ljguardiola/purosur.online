import { Tab, Tabs } from "@purosur/ui";
import { createLink, getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTopBar } from "./area-top-bar";
import { useDocumentTitle } from "./document-title";
import { ScreenLayout } from "./screen-layout";
import { STOCK_TAB_TARGETS, type StockTab } from "./stock-tabs";

const route = getRouteApi("/signed-in/stock-area/stock");

const StockTabLink = createLink(Tab);

const TAB_LABELS: Record<StockTab, string> = {
  balances: "Saldos",
  expiries: "Vencimientos",
  movements: "Movimientos",
};

export function StockPage(): ReactElement {
  const { stockTabs } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Stock · Puro Sur");
  const selectedTab: StockTab = matchRoute({ to: "/stock/expiries" })
    ? "expiries"
    : matchRoute({ to: "/stock/movements" })
      ? "movements"
      : "balances";

  return (
    <ScreenLayout topBar={<AreaTopBar title="Stock" />} bodyClassName="p-0">
      {stockTabs.length > 0 && (
        <Tabs
          label="Secciones de Stock"
          selectedTab={selectedTab}
          tabs={stockTabs.map((key) => (
            <StockTabLink
              key={key}
              to={STOCK_TAB_TARGETS[key]}
              search={key === selectedTab ? true : {}}
              value={key}
              label={TAB_LABELS[key]}
            />
          ))}
        >
          <Outlet />
        </Tabs>
      )}
    </ScreenLayout>
  );
}
