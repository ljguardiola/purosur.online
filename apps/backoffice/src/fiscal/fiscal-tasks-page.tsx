import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { FiscalTasksScreen } from "./fiscal-tasks-screen";
import { defaultFiscalTasksScreenServices } from "./fiscal-tasks-services";

const route = getRouteApi("/signed-in/cash-and-fiscal-area/fiscal-tasks");

export function FiscalTasksPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Tareas fiscales · Puro Sur");
  return (
    <FiscalTasksScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.fiscalTasksScreen ?? defaultFiscalTasksScreenServices}
    />
  );
}
