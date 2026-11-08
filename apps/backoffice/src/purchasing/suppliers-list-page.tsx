import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { SuppliersListScreen } from "./suppliers-list-screen";
import { defaultSuppliersListScreenServices } from "./suppliers-list-services";

const route = getRouteApi("/signed-in/purchasing-area/suppliers/");

export function SuppliersListPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const { supplier, tab, ...filters } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <SuppliersListScreen
      access={session}
      filters={filters}
      onFiltersChange={(next) =>
        void navigate({ search: (current) => ({ ...current, ...next }), replace: true })
      }
      openSupplier={supplier}
      panelTab={tab}
      onOpenSupplierChange={(opened) =>
        void navigate({
          search: (current) => ({ ...current, supplier: opened, tab: undefined }),
          ...(opened === undefined ? { replace: true } : {}),
        })
      }
      onSessionEnded={sessionActions.sessionEnded}
      services={services.suppliersListScreen ?? defaultSuppliersListScreenServices}
    />
  );
}
