import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { SnapshotBackupsScreen } from "./snapshot-backups-screen";
import { defaultSnapshotBackupsScreenServices } from "./snapshot-backups-services";

const route = getRouteApi("/signed-in/settings-area/backups");

export function SnapshotBackupsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Backups · Puro Sur");
  return (
    <SnapshotBackupsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.snapshotBackupsScreen ?? defaultSnapshotBackupsScreenServices}
    />
  );
}
