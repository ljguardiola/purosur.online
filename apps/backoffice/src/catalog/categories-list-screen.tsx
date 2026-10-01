import type { CategorySummary } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  plural,
  SearchField,
  Table,
  type TableSort,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Pencil, Plus, Search, Tags } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { useCategoriesQuery, useRefreshCatalog, useReloadCategory } from "./catalog-queries";
import type { CategoriesListScreenServices } from "./categories-list-services";
import { categoryNameOrder, categoryParentId, categoryPathLabels } from "./category-path";
import { EditCategoryModal } from "./edit-category-modal";
import { NewCategoryModal } from "./new-category-modal";
import type { CategoriesListFilters } from "./routes";

export type CategoriesListScreenProps = {
  filters: CategoriesListFilters;
  onFiltersChange: (filters: CategoriesListFilters) => void;
  onSessionEnded: () => void;
  services: CategoriesListScreenServices;
};

const NO_CATEGORIES: CategorySummary[] = [];

export function CategoriesListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: CategoriesListScreenProps) {
  const { fetchCategories, createCategory, editCategory } = services;
  const data = useCategoriesQuery({ fetchCategories, onSessionEnded });
  const refreshCatalog = useRefreshCatalog();
  const reloadCategory = useReloadCategory({ fetchCategories });
  const [search, setSearch] = useState(filters.search);
  const [sort, setSort] = useState<TableSort<"category">>({
    column: "category",
    direction: filters.sort,
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CategorySummary | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: CategoriesListFilters = { search, sort: sort.direction };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, sort.direction, filters]);

  useEffect(() => {
    if (data.status === "failed") {
      setEditTarget(null);
    }
  }, [data.status]);

  const categories = data.status === "loaded" ? data.value : NO_CATEGORIES;
  const labels = categoryPathLabels(categories);
  const pathLabel = (category: CategorySummary) => labels.get(category.id) ?? category.name;
  const columns = [
    dataColumn({
      id: "category",
      header: "Categoría",
      sort: { order: categoryNameOrder, firstDirection: "ascending" },
      render: pathLabel,
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: CategorySummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar la categoría ${item.name}`,
          onPress: () => setEditTarget(item),
        }),
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: categories,
    id: (category) => category.id,
    parentId: categoryParentId,
    search: { text: search, in: (category) => [pathLabel(category)] },
    columns,
    sort,
    onSortChange: setSort,
  });
  const matchCount = table.getRowModel().rows.length;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Catálogo</p>
              <ScreenTitle>Categorías</ScreenTitle>
            </div>
            <Button
              variant="primary"
              icon={<Plus />}
              dataStatus={data.status}
              onPress={() => setNewModalOpen(true)}
            >
              Nueva categoría
            </Button>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="w-105">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar una categoría"
            icon={<Search />}
          />
        </div>
        <Table
          aria-label="Categorías"
          table={table}
          {...cloudTableState(data, "las categorías")}
          empty={
            categories.length === 0
              ? {
                  icon: <Tags />,
                  title: "Todavía no hay categorías",
                  description: "Creá la primera para poder darle una a un producto.",
                  variant: "blank",
                }
              : {
                  icon: <Search />,
                  title: "Sin resultados",
                  description: "Probá con otro nombre.",
                  variant: "filtered",
                }
          }
          footer={
            matchCount === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {plural(matchCount, {
                  one: "1 categoría",
                  other: `${matchCount} categorías`,
                })}
              </p>
            )
          }
        />
      </ScreenLayout>
      <NewCategoryModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={() => {
          setNewModalOpen(false);
          void refreshCatalog();
        }}
        onSessionEnded={onSessionEnded}
        createCategory={createCategory}
        categories={categories}
      />
      {data.status === "loaded" ? (
        <EditCategoryModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refreshCatalog();
          }}
          onSessionEnded={onSessionEnded}
          reload={reloadCategory}
          editCategory={editCategory}
          categories={data.value}
        />
      ) : null}
    </>
  );
}
