import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { BrandsListScreen } from "./brands-list-screen";
import { defaultBrandsListScreenServices } from "./brands-list-services";
import { CategoriesListScreen } from "./categories-list-screen";
import { defaultCategoriesListScreenServices } from "./categories-list-services";
import { TagsListScreen } from "./tags-list-screen";
import { defaultTagsListScreenServices } from "./tags-list-services";

const route = getRouteApi("/signed-in/products-area/products/classification");

export function ClassificationPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-1 gap-6 p-6">
      <CategoriesListScreen
        filters={{ search: search.categorySearch, sort: search.categorySort }}
        onFiltersChange={(next) =>
          void navigate({
            search: (current) => ({
              ...current,
              categorySearch: next.search,
              categorySort: next.sort,
            }),
            replace: true,
          })
        }
        onSessionEnded={sessionActions.sessionEnded}
        services={services.categoriesListScreen ?? defaultCategoriesListScreenServices}
      />
      <BrandsListScreen
        filters={{
          search: search.brandSearch,
          status: search.brandStatus,
          sortBy: search.brandSortBy,
          sort: search.brandSort,
        }}
        onFiltersChange={(next) =>
          void navigate({
            search: (current) => ({
              ...current,
              brandSearch: next.search,
              brandStatus: next.status,
              brandSortBy: next.sortBy,
              brandSort: next.sort,
            }),
            replace: true,
          })
        }
        onSessionEnded={sessionActions.sessionEnded}
        services={services.brandsListScreen ?? defaultBrandsListScreenServices}
      />
      <TagsListScreen
        filters={{
          search: search.tagSearch,
          status: search.tagStatus,
          sortBy: search.tagSortBy,
          sort: search.tagSort,
        }}
        onFiltersChange={(next) =>
          void navigate({
            search: (current) => ({
              ...current,
              tagSearch: next.search,
              tagStatus: next.status,
              tagSortBy: next.sortBy,
              tagSort: next.sort,
            }),
            replace: true,
          })
        }
        onSessionEnded={sessionActions.sessionEnded}
        services={services.tagsListScreen ?? defaultTagsListScreenServices}
      />
    </div>
  );
}
