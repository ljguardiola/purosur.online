import { Tab, Tabs } from "@purosur/ui";
import { createLink, getRouteApi, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AreaTopBar } from "../shell/area-top-bar";
import { useDocumentTitle } from "../shell/document-title";
import { ScreenLayout } from "../shell/screen-layout";
import { FiscalStatusStrip } from "./fiscal-status-strip";
import { defaultFiscalStatusStripServices } from "./fiscal-status-strip-services";
import { FISCAL_TAB_TARGETS, type FiscalTab } from "./fiscal-tabs";

const route = getRouteApi("/signed-in/fiscal-area/fiscal");

const FiscalTabLink = createLink(Tab);

const TAB_LABELS: Record<FiscalTab, string> = {
  tasks: "Tareas fiscales",
  documents: "Comprobantes",
  caea: "CAEA y excepcionalidad",
  settings: "Configuración",
};

export function FiscalLayout(): ReactElement {
  const { session, services, sessionActions, fiscalTabs } = route.useRouteContext();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Fiscal · Puro Sur");
  const selectedTab: FiscalTab = matchRoute({ to: "/fiscal/documents" })
    ? "documents"
    : matchRoute({ to: "/fiscal/caea" })
      ? "caea"
      : matchRoute({ to: "/fiscal/settings" })
        ? "settings"
        : "tasks";

  return (
    <ScreenLayout topBar={<AreaTopBar eyebrow="ARCA" title="Fiscal" />} bodyClassName="p-0">
      <FiscalStatusStrip
        access={session}
        onSessionEnded={sessionActions.sessionEnded}
        services={services.fiscalStatusStrip ?? defaultFiscalStatusStripServices}
      />
      <Tabs
        label="Secciones de Fiscal"
        selectedTab={selectedTab}
        tabs={fiscalTabs.map((key) => (
          <FiscalTabLink
            key={key}
            to={FISCAL_TAB_TARGETS[key]}
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
