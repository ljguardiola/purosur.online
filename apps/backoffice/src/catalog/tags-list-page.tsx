import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { TagsListScreen } from "./tags-list-screen";
import { defaultTagsListScreenServices } from "./tags-list-services";

const route = getRouteApi("/signed-in/products-area/products/classification/tags");

export function TagsListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <TagsListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.tagsListScreen ?? defaultTagsListScreenServices}
    />
  );
}
