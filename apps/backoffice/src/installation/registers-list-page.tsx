import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { RegistersListScreen } from "./registers-list-screen";
import { defaultRegistersListScreenServices } from "./registers-list-services";

const route = getRouteApi("/signed-in/sales-and-cash-area/registers/");

export function RegistersListPage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  const { register, tab, from, to } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <RegistersListScreen
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.registersListScreen ?? defaultRegistersListScreenServices}
      registerPointOfSaleSection={services.registerPointOfSaleSection}
      registerPanelSections={services.registerPanelSections}
      registerPaymentAndKeyModals={services.registerPaymentAndKeyModals}
      openRegister={register}
      tab={tab}
      sessionsPeriod={{ from, to }}
      onSessionsPeriodChange={(period) =>
        void navigate({ search: (previous) => ({ ...previous, ...period }), replace: true })
      }
    />
  );
}
