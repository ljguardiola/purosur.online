import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { FiscalStatusStrip } from "./fiscal-status-strip";
import { defaultFiscalStatusStripServices } from "./fiscal-status-strip-services";
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
      summary={
        <FiscalStatusStrip
          access={session}
          onSessionEnded={sessionActions.sessionEnded}
          services={services.fiscalStatusStrip ?? defaultFiscalStatusStripServices}
        />
      }
    />
  );
}
