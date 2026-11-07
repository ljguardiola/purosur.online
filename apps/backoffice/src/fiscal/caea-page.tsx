import { getRouteApi } from "@tanstack/react-router";
import { type ReactElement, Suspense } from "react";
import { lazyScreen } from "../shell/lazy-screen";
import { CaeaScreen } from "./caea-screen";
import { defaultCaeaScreenServices } from "./caea-services";

const route = getRouteApi("/signed-in/fiscal-area/fiscal/caea");

const ContingencyTicketRescueAssistant = lazyScreen(
  () => import("../backups/contingency-ticket-rescue-assistant"),
  "ContingencyTicketRescueAssistant",
);

export function CaeaPage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  const { assistant, ...filters } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <>
      <CaeaScreen
        access={session}
        filters={filters}
        onFiltersChange={(next) =>
          void navigate({ search: (previous) => ({ ...previous, ...next }), replace: true })
        }
        onRescue={() =>
          void navigate({
            search: (previous) => ({ ...previous, assistant: "contingency-ticket-rescue" }),
          })
        }
        onSessionEnded={sessionActions.sessionEnded}
        services={services.caeaScreen ?? defaultCaeaScreenServices}
      />
      {assistant === undefined ? null : (
        <Suspense fallback={null}>
          <ContingencyTicketRescueAssistant
            onClose={() =>
              void navigate({
                search: (previous) => ({ ...previous, assistant: undefined }),
              })
            }
          />
        </Suspense>
      )}
    </>
  );
}
