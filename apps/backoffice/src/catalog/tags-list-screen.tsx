import type { TagSummary } from "@purosur/contracts";
import {
  actionsColumn,
  dataColumn,
  formatNumber,
  type ItemOrder,
  ListFilter,
  StatusIndicator,
  type TableSort,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Ban, Pencil, RotateCcw, SearchX, Sparkles } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { NewTagModal } from "../platform/new-tag-modal";
import { useRefreshCatalog, useReloadTag, useTagsQuery } from "./catalog-queries";
import { ClassificationList } from "./classification-list";
import { DeactivateTagModal } from "./deactivate-tag-modal";
import { EditTagModal } from "./edit-tag-modal";
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
  active: "No hay etiquetas activas",
  inactive: "No hay etiquetas inactivas",
  all: "Sin resultados",
} satisfies Record<TagStatusFilter, string>;

const tagNameOrder = textOrder((tag: TagSummary) => tag.name);

const productCountOrder: ItemOrder<TagSummary> = (a, b) =>
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

  const statusFilterOptions = [
    { value: "active" as const, label: "Activas" },
    { value: "inactive" as const, label: "Inactivas" },
    { value: "all" as const, label: "Todas" },
  ] as const;

  const columns = [
    dataColumn({
      id: "tag",
      header: "Etiqueta",
      sort: { order: tagNameOrder, firstDirection: "ascending" },
      render: (item: TagSummary) => item.name,
    }),
    dataColumn({
      id: "products",
      header: "Productos",
      sort: { order: productCountOrder, firstDirection: "descending" },
      render: (item: TagSummary) => formatNumber(item.productCount),
    }),
    dataColumn({
      id: "status",
      header: "Estado",
      render: (item: TagSummary) =>
        item.active ? (
          <StatusIndicator tone="success">Activa</StatusIndicator>
        ) : (
          <StatusIndicator tone="neutral">Inactiva</StatusIndicator>
        ),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: TagSummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar la etiqueta ${item.name}`,
          onPress: () => setEditTarget(item),
        }),
        (item: TagSummary) =>
          item.active
            ? {
                icon: <Ban />,
                "aria-label": `Desactivar la etiqueta ${item.name}`,
                onPress: () => setDeactivateTarget(item),
              }
            : {
                icon: <RotateCcw />,
                "aria-label": `Reactivar la etiqueta ${item.name}`,
                onPress: () => setReactivateTarget(item),
              },
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: tags,
    id: (tag) => tag.id,
    search: { text: search, in: (tag) => [tag.name] },
    filter: (tag) => showsStatus(tag, statusFilter),
    columns,
    sort,
    onSortChange: setSort,
  });
  const matchedTags = table.getRowModel().rows.map((row) => row.original);

  return (
    <ClassificationList
      label="Etiquetas"
      searchPlaceholder="Buscar una etiqueta"
      search={search}
      onSearchChange={setSearch}
      filters={
        <ListFilter
          name="status"
          label="Estado:"
          options={statusFilterOptions}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      }
      createLabel="Nueva etiqueta"
      onCreate={() => setNewModalOpen(true)}
      table={table}
      {...cloudTableState(data, "las etiquetas")}
      empty={
        tags.length === 0
          ? {
              icon: <Sparkles />,
              title: "Todavía no hay etiquetas",
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
        matchedTags.length === 0 ? undefined : (
          <p className="text-text-subtle text-detail">
            {tagsFooterText(matchedTags, taggedProductCount)}
          </p>
        )
      }
    >
      <NewTagModal
        open={newModalOpen}
        context="Productos · Etiquetas"
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
    </ClassificationList>
  );
}
