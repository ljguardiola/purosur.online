import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { TagsListScreen } from "./tags-list-screen";

const route = getRouteApi("/signed-in/catalog/tags");

export function TagsListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Distintivos · Puro Sur");
  return (
    <TagsListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.tagsListScreen}
    />
  );
}
