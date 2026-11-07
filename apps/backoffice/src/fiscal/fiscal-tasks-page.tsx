import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { FiscalTasksScreen } from "./fiscal-tasks-screen";
import { defaultFiscalTasksScreenServices } from "./fiscal-tasks-services";

const route = getRouteApi("/signed-in/fiscal-area/fiscal/");

export function FiscalTasksPage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  return (
    <FiscalTasksScreen
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.fiscalTasksScreen ?? defaultFiscalTasksScreenServices}
    />
  );
}
