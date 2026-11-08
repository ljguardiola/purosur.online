import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { FreightsListScreen } from "./freights-list-screen";
import { defaultFreightsListScreenServices } from "./freights-list-services";

const route = getRouteApi("/signed-in/purchasing-area/freights");

export function FreightsListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const { supplier, ...filters } = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Flete · Puro Sur");
  return (
    <FreightsListScreen
      filters={filters}
      onFiltersChange={(next) =>
        void navigate({ search: (current) => ({ ...current, ...next }), replace: true })
      }
      onSessionEnded={sessionActions.sessionEnded}
      services={services.freightsListScreen ?? defaultFreightsListScreenServices}
      supplierFilter={
        supplier === undefined
          ? undefined
          : {
              supplierId: supplier,
              onClear: () =>
                void navigate({
                  search: (current) => ({ ...current, supplier: undefined }),
                  replace: true,
                }),
            }
      }
    />
  );
}
