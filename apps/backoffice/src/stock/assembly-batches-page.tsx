import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { AssemblyBatchesScreen } from "./assembly-batches-screen";
import { defaultAssemblyBatchesScreenServices } from "./assembly-batches-services";

const route = getRouteApi("/signed-in/stock-area/assembly-batches");

export function AssemblyBatchesPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Tandas · Puro Sur");
  return (
    <AssemblyBatchesScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.assemblyBatchesScreen ?? defaultAssemblyBatchesScreenServices}
    />
  );
}
