import {
  actionsColumn,
  Button,
  ButtonLink,
  dataColumn,
  EmptyState,
  FloatingNotification,
  formatCents,
  formatNumber,
  InlineNotice,
  ListFilter,
  SearchField,
  StatusIndicator,
  Table,
  TablePagination,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import {
  Check,
  Download,
  FileX,
  LoaderCircle,
  Pencil,
  Search,
  SearchX,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import { ConfirmSupplierPriceListModal } from "./confirm-supplier-price-list-modal";
import { DiscardSupplierPriceListModal } from "./discard-supplier-price-list-modal";
import { EditSupplierPriceListRowPriceModal } from "./edit-supplier-price-list-row-price-modal";
import { useRefreshPurchasing, useSupplierPriceListReviewQuery } from "./purchasing-queries";
import { RemoveSupplierPriceListRowModal } from "./remove-supplier-price-list-row-modal";
import type { SupplierPriceListReviewScreenServices } from "./supplier-price-list-review-services";
import { supplierPriceListStatusOf } from "./supplier-price-list-status";
import type { SupplierPriceListReviewList, SupplierPriceListRow } from "./supplier-price-lists-api";
import type { SupplierPriceListReviewFilters } from "./supplier-price-lists-filters";

export type SupplierPriceListReviewScreenProps = {
  listId: string;
  filters: SupplierPriceListReviewFilters;
  onFiltersChange: (filters: SupplierPriceListReviewFilters) => void;
  onBack: () => void;
  onSessionEnded: () => void;
  services: SupplierPriceListReviewScreenServices;
};

type ShowFilter = SupplierPriceListReviewFilters["show"];
type Notice = "priceSaved" | "rowRemoved";

const NO_ROWS: SupplierPriceListRow[] = [];

const SHOW_FILTER_OPTIONS = [
  { value: "all" as const, label: "Todos" },
  { value: "unpriced" as const, label: "Sin precio" },
] as const;

const NOTICES = {
  priceSaved: { title: "Precio guardado", description: "Queda en la lista hasta que se confirme." },
  rowRemoved: { title: "Ítem quitado", description: "Ya no forma parte de la lista." },
} as const;

function detailOf(row: SupplierPriceListRow): string {
  return [
    row.code === null ? null : `Cód. ${row.code}`,
    row.presentation,
    row.page === null ? null : `página ${row.page}`,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

export function SupplierPriceListReviewScreen({
  listId,
  filters,
  onFiltersChange,
  onBack,
  onSessionEnded,
  services,
}: SupplierPriceListReviewScreenProps) {
  const data = useSupplierPriceListReviewQuery({
    listId,
    fetchSupplierPriceListReview: services.fetchSupplierPriceListReview,
    onSessionEnded,
  });
  const refreshPurchasing = useRefreshPurchasing();
  const [search, setSearch] = useState(filters.search);
  const [show, setShow] = useState<ShowFilter>(filters.show);
  const [page, setPage] = useState(1);
  const [priceTarget, setPriceTarget] = useState<SupplierPriceListRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<SupplierPriceListRow | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<SupplierPriceListReviewList | null>(null);
  const [discardTarget, setDiscardTarget] = useState<SupplierPriceListReviewList | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: SupplierPriceListReviewFilters = { search, show };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, show, filters]);

  const review = data.status === "loaded" && data.value.kind === "found" ? data.value.review : null;
  const list = review?.list ?? null;
  const status = list === null ? null : supplierPriceListStatusOf(list);
  const actions = review?.actions ?? null;
  const unread = list?.state === "READING" || list?.state === "READ_FAILED";

  const columns = [
    dataColumn({
      id: "item",
      header: "Ítem del proveedor",
      render: (row: SupplierPriceListRow) => {
        const detail = detailOf(row);
        return (
          <div className="flex flex-col">
            <span>{row.description}</span>
            {detail === "" ? null : <span className="text-detail text-text-subtle">{detail}</span>}
          </div>
        );
      },
    }),
    dataColumn({
      id: "price",
      header: "Precio",
      align: "end",
      render: (row: SupplierPriceListRow) =>
        row.priceCents === null ? (
          <span className="font-semibold text-error">Sin precio</span>
        ) : (
          formatCents(row.priceCents)
        ),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (row: SupplierPriceListRow) =>
          actions?.changeRows
            ? {
                icon: <Pencil />,
                "aria-label": `Editar el precio de ${row.description}`,
                onPress: () => setPriceTarget(row),
              }
            : undefined,
        (row: SupplierPriceListRow) =>
          actions?.changeRows
            ? {
                icon: <Trash2 />,
                "aria-label": `Quitar ${row.description} de la lista`,
                onPress: () => setRemoveTarget(row),
              }
            : undefined,
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: review?.rows ?? NO_ROWS,
    id: (row) => row.id,
    search: { text: search, in: (row) => [row.description, row.code ?? ""] },
    filter: (row) => show === "all" || row.priceCents === null,
    columns,
    paging: { page, onPageChange: setPage },
  });
  const rowCount = table.getRowCount();
  const { pageIndex, pageSize } = table.state.pagination;
  const firstShown = pageIndex * pageSize + 1;
  const lastShown = Math.min(firstShown + pageSize - 1, rowCount);

  function refreshAfter(shown: Notice | null) {
    setPriceTarget(null);
    setRemoveTarget(null);
    setConfirmTarget(null);
    setDiscardTarget(null);
    setNotice(shown);
    void refreshPurchasing();
  }

  return (
    <>
      <ScreenLayout
        topBar={
          <AreaTopBar
            eyebrow="Pedidos · Listas de proveedores"
            title={list === null ? "Lista de proveedor" : `Lista de ${list.supplier.name}`}
            action={
              list === null ? undefined : (
                <div className="flex items-center gap-3">
                  <ButtonLink
                    variant="text"
                    icon={<Download />}
                    href={`/api/supplier-price-lists/${list.id}/file`}
                    download
                  >
                    Descargar el PDF
                  </ButtonLink>
                  {actions?.discard ? (
                    <Button
                      variant="secondary"
                      destructive
                      icon={<Trash2 />}
                      onPress={() => setDiscardTarget(list)}
                    >
                      Descartar la lista
                    </Button>
                  ) : null}
                  {actions?.confirm ? (
                    <Button
                      variant="primary"
                      icon={<Check />}
                      onPress={() => setConfirmTarget(list)}
                    >
                      Confirmar la lista
                    </Button>
                  ) : null}
                </div>
              )
            }
          />
        }
        bodyClassName="gap-4 p-6"
      >
        {list?.state === "READING" && status !== null ? (
          <InlineNotice
            tone="info"
            icon={<LoaderCircle />}
            title={status.label}
            description="Cuando termine, los ítems aparecen acá para revisar."
          />
        ) : null}
        {list?.state === "READ_FAILED" && status !== null ? (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={status.label}
            {...(status.reason === undefined ? {} : { description: status.reason })}
          />
        ) : null}
        {data.status === "loaded" && data.value.kind === "not_found" ? (
          <EmptyState icon={<FileX />} title="Esta lista ya no existe" variant="blank" />
        ) : unread ? null : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-105">
                <SearchField
                  value={search}
                  onChange={(next) => {
                    setSearch(next);
                    setPage(1);
                  }}
                  placeholder="Buscar un ítem"
                  icon={<Search />}
                />
              </div>
              <ListFilter
                name="show"
                label="Mostrar:"
                options={SHOW_FILTER_OPTIONS}
                value={show}
                onChange={(next) => {
                  setShow(next);
                  setPage(1);
                }}
              />
              <div className="flex flex-1 items-center justify-end gap-3">
                {list?.listDate == null ? null : (
                  <p className="text-detail text-text-subtle">
                    Lista del {formatDisplayDate(list.listDate)}
                  </p>
                )}
                {list?.pricesIncludeVat == null ? null : (
                  <p className="text-detail text-text-subtle">
                    {list.pricesIncludeVat ? "Precios con IVA incluido" : "Precios sin IVA"}
                  </p>
                )}
                {status !== null && (list?.state === "REVIEWED" || list?.state === "DISCARDED") ? (
                  <StatusIndicator tone={status.tone}>{status.label}</StatusIndicator>
                ) : null}
              </div>
            </div>
            <Table
              aria-label="Ítems de la lista"
              table={table}
              {...cloudTableState(data, "la lista")}
              empty={
                (review?.rows.length ?? 0) === 0
                  ? {
                      icon: <FileX />,
                      title: "La lista no tiene ítems",
                      variant: "blank",
                    }
                  : { icon: <SearchX />, title: "Sin resultados", variant: "filtered" }
              }
              footer={
                rowCount === 0 || list === null ? undefined : (
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-text-subtle text-detail">
                      {`${formatNumber(firstShown)} a ${formatNumber(lastShown)} de ${formatNumber(rowCount)} ítems`}
                      {list.unpricedRowCount === 0
                        ? ""
                        : ` · ${formatNumber(list.unpricedRowCount)} sin precio`}
                    </p>
                    <TablePagination table={table} label="Páginas de ítems" />
                  </div>
                )
              }
            />
          </>
        )}
      </ScreenLayout>
      {list === null ? null : (
        <>
          <EditSupplierPriceListRowPriceModal
            list={list}
            target={priceTarget}
            services={services}
            onSaved={() => refreshAfter("priceSaved")}
            onOutdated={() => refreshAfter(null)}
            onClose={() => setPriceTarget(null)}
            onSessionEnded={onSessionEnded}
          />
          <RemoveSupplierPriceListRowModal
            list={list}
            target={removeTarget}
            services={services}
            onRemoved={() => refreshAfter("rowRemoved")}
            onOutdated={() => refreshAfter(null)}
            onClose={() => setRemoveTarget(null)}
            onSessionEnded={onSessionEnded}
          />
          <ConfirmSupplierPriceListModal
            target={confirmTarget}
            services={services}
            onConfirmed={() => {
              refreshAfter(null);
              onBack();
            }}
            onOutdated={() => refreshAfter(null)}
            onClose={() => setConfirmTarget(null)}
            onSessionEnded={onSessionEnded}
          />
          <DiscardSupplierPriceListModal
            target={discardTarget}
            services={services}
            onDiscarded={() => {
              refreshAfter(null);
              onBack();
            }}
            onOutdated={() => refreshAfter(null)}
            onClose={() => setDiscardTarget(null)}
            onSessionEnded={onSessionEnded}
          />
        </>
      )}
      {notice === null ? null : (
        <FloatingNotification
          tone="success"
          icon={<Check />}
          title={NOTICES[notice].title}
          description={NOTICES[notice].description}
          onDismiss={() => setNotice(null)}
        />
      )}
    </>
  );
}
