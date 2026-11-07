import { Tab, Tabs } from "@purosur/ui";
import { createLink, getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTopBar } from "../shell/area-top-bar";
import { useDocumentTitle } from "../shell/document-title";
import { ScreenLayout } from "../shell/screen-layout";
import { REGISTERS_TAB_TARGETS, type RegistersTab } from "./registers-tabs";

const route = getRouteApi("/signed-in/sales-and-cash-area/registers");

const RegistersTabLink = createLink(Tab);

const TAB_LABELS: Record<RegistersTab, string> = {
  registers: "Cajas",
  closes: "Cierres de caja",
  movements: "Movimientos de efectivo",
};

export function RegisterLayout(): ReactElement {
  const { registersTabs } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Cajas · Puro Sur");
  const selectedTab: RegistersTab = matchRoute({ to: "/registers/closes" })
    ? "closes"
    : matchRoute({ to: "/registers/movements" })
      ? "movements"
      : "registers";

  return (
    <ScreenLayout topBar={<AreaTopBar eyebrow="Ventas y caja" title="Cajas" />} bodyClassName="p-0">
      <Tabs
        label="Secciones de Cajas"
        selectedTab={selectedTab}
        tabs={registersTabs.map((key) => (
          <RegistersTabLink
            key={key}
            to={REGISTERS_TAB_TARGETS[key]}
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
