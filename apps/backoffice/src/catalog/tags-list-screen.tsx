import type { TagSummary } from "@purosur/contracts";
import {
  Button,
  formatNumber,
  ListFilter,
  SearchField,
  StatusIndicator,
  Table,
  type TableItemOrder,
  type TableSort,
  tableRows,
  textOrder,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Ban, Pencil, Plus, RotateCcw, Search, SearchX, Sparkles } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { useRefreshCatalog, useReloadTag, useTagsQuery } from "./catalog-queries";
import { DeactivateTagModal } from "./deactivate-tag-modal";
import { EditTagModal } from "./edit-tag-modal";
import { NewTagModal } from "./new-tag-modal";
import { ReactivateTagModal } from "./reactivate-tag-modal";
import type { TagsListFilters } from "./routes";
import { tagsFooterText } from "./tags-footer-text";
import type { TagsListScreenServices } from "./tags-list-services";

export type TagsListScreenProps = {
  filters: TagsListFilters;
  onFiltersChange: (filters: TagsListFilters) => void;
  onSessionEnded: () => void;
  services: TagsListScreenServices;
};

type TagStatusFilter = TagsListFilters["status"];
type TagSortColumn = TagsListFilters["sortBy"];

const NO_TAGS: TagSummary[] = [];

const TAG_STATUS_EMPTY_TITLE = {
  active: "No hay distintivos activos",
  inactive: "No hay distintivos inactivos",
  all: "Sin resultados",
} satisfies Record<TagStatusFilter, string>;

const tagNameOrder = textOrder((tag: TagSummary) => tag.name);

const productCountOrder: TableItemOrder<TagSummary> = (a, b) =>
  a.productCount - b.productCount || tagNameOrder(a, b);

function showsStatus(tag: TagSummary, status: TagStatusFilter): boolean {
  return status === "all" || tag.active === (status === "active");
}

export function TagsListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: TagsListScreenProps) {
  const data = useTagsQuery({ fetchTags: services.fetchTags, onSessionEnded });
  const refreshCatalog = useRefreshCatalog();
  const reloadTag = useReloadTag({ fetchTags: services.fetchTags });
  const [search, setSearch] = useState(filters.search);
  const [statusFilter, setStatusFilter] = useState<TagStatusFilter>(filters.status);
  const [sort, setSort] = useState<TableSort<TagSortColumn>>({
    column: filters.sortBy,
    direction: filters.sort,
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TagSummary | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<TagSummary | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<TagSummary | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: TagsListFilters = {
      search,
      status: statusFilter,
      sortBy: sort.column,
      sort: sort.direction,
    };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, statusFilter, sort.column, sort.direction, filters]);

  useEffect(() => {
    if (data.status === "failed") {
      setEditTarget(null);
    }
  }, [data.status]);

  const { tags, taggedProductCount } =
    data.status === "loaded" ? data.value : { tags: NO_TAGS, taggedProductCount: 0 };
  const { rows, matchCount } = tableRows({
    items: tags,
    id: (tag) => tag.id,
    search: { text: search, in: (tag) => [tag.name] },
    filter: (tag) => showsStatus(tag, statusFilter),
    sort: { by: sort, orders: { tag: tagNameOrder, products: productCountOrder } },
  });

  const statusFilterOptions = [
    { value: "active" as const, label: "Activos" },
    { value: "inactive" as const, label: "Inactivos" },
    { value: "all" as const, label: "Todos" },
  ] as const;

  const columns = [
    {
      key: "tag",
      header: "Distintivo",
      sortable: true,
      defaultDirection: "ascending",
      render: (item: TagSummary) => item.name,
    },
    {
      key: "products",
      header: "Productos",
      sortable: true,
      defaultDirection: "descending",
      render: (item: TagSummary) => formatNumber(item.productCount),
    },
    {
      key: "status",
      header: "Estado",
      render: (item: TagSummary) =>
        item.active ? (
          <StatusIndicator tone="success">Activo</StatusIndicator>
        ) : (
          <StatusIndicator tone="neutral">Inactivo</StatusIndicator>
        ),
    },
    {
      key: "actions",
      kind: "actions",
      header: "Acciones",
      actions: [
        (item: TagSummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar el distintivo ${item.name}`,
          onPress: () => setEditTarget(item),
        }),
        (item: TagSummary) =>
          item.active
            ? {
                icon: <Ban />,
                "aria-label": `Desactivar el distintivo ${item.name}`,
                onPress: () => setDeactivateTarget(item),
              }
            : {
                icon: <RotateCcw />,
                "aria-label": `Reactivar el distintivo ${item.name}`,
                onPress: () => setReactivateTarget(item),
              },
      ],
    },
  ] as const;

  const matchedTags = rows.map((row) => row.item);

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Catálogo</p>
              <ScreenTitle>Distintivos</ScreenTitle>
            </div>
            <Button variant="primary" icon={<Plus />} onPress={() => setNewModalOpen(true)}>
              Nuevo distintivo
            </Button>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-105">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar un distintivo"
              icon={<Search />}
            />
          </div>
          <ListFilter
            label="Estado:"
            options={statusFilterOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <Table
          aria-label="Distintivos"
          columns={columns}
          sort={sort}
          onSortChange={setSort}
          {...cloudTableState(data, "los distintivos")}
          rows={rows}
          empty={
            tags.length === 0
              ? {
                  icon: <Sparkles />,
                  title: "Todavía no hay distintivos",
                  description:
                    'Se cargan para marcar características como "Sin TACC" o "Vegano" en los productos.',
                  variant: "blank",
                }
              : search.trim() === ""
                ? {
                    icon: <SearchX />,
                    title: TAG_STATUS_EMPTY_TITLE[statusFilter],
                    variant: "filtered",
                  }
                : {
                    icon: <SearchX />,
                    title: "Sin resultados",
                    description: "Probá con otro nombre.",
                    variant: "filtered",
                  }
          }
          footer={
            matchCount === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {tagsFooterText(matchedTags, taggedProductCount)}
              </p>
            )
          }
        />
      </ScreenLayout>
      <NewTagModal
        open={newModalOpen}
        context="Catálogo"
        services={services}
        onCreated={() => {
          setNewModalOpen(false);
          void refreshCatalog();
        }}
        onClose={() => setNewModalOpen(false)}
        onSessionEnded={onSessionEnded}
      />
      {data.status === "loaded" ? (
        <EditTagModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refreshCatalog();
          }}
          onSessionEnded={onSessionEnded}
          reload={reloadTag}
          services={services}
        />
      ) : null}
      <DeactivateTagModal
        target={deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onDeactivated={() => {
          setDeactivateTarget(null);
          void refreshCatalog();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <ReactivateTagModal
        target={reactivateTarget}
        onClose={() => setReactivateTarget(null)}
        onReactivated={() => {
          setReactivateTarget(null);
          void refreshCatalog();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
    </>
  );
}
