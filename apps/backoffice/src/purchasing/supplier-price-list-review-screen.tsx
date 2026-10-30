import type { SupplierPriceListReview } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  ButtonLink,
  dataColumn,
  EmptyState,
  FloatingNotification,
  formatNumber,
  InlineNotice,
  ListFilter,
  plural,
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
  ExternalLink,
  FileX,
  Link2,
  LoaderCircle,
  PackagePlus,
  Pencil,
  Search,
  SearchX,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { CategoryCreationModal, ProductCreationModal } from "../platform/creation-parts";
import { formatDisplayDate } from "../platform/display-date";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { AreaTopBar } from "../shell/area-top-bar";
import {
  type BackofficeAccess,
  canManageProductsAndCategories,
  canManagePurchasePackagings,
  canSeeBranchArea,
} from "../shell/backoffice-access";
import { ScreenLayout } from "../shell/screen-layout";
import { ConfirmSupplierPriceListModal } from "./confirm-supplier-price-list-modal";
import { CreateProductFromSupplierItemModal } from "./create-product-from-supplier-item-modal";
import { DiscardSupplierPriceListModal } from "./discard-supplier-price-list-modal";
import { EditSupplierPriceListRowPriceModal } from "./edit-supplier-price-list-row-price-modal";
import { LinkSupplierItemModal } from "./link-supplier-item-modal";
import { useRefreshPurchasing, useSupplierPriceListReviewQuery } from "./purchasing-queries";
import { RemoveSupplierPriceListRowModal } from "./remove-supplier-price-list-row-modal";
import type { SupplierPriceListReviewScreenServices } from "./supplier-price-list-review-services";
import {
  RowItemCell,
  RowLinkCell,
  RowPriceCell,
  RowStatusCell,
} from "./supplier-price-list-row-cells";
import { SupplierPriceListAiCost } from "./supplier-price-list-ai-cost";
import { supplierPriceListStatusOf } from "./supplier-price-list-status";
import type { SupplierPriceListReviewList, SupplierPriceListRow } from "./supplier-price-lists-api";
import type { SupplierPriceListReviewFilters } from "./supplier-price-lists-filters";

export type SupplierPriceListReviewScreenProps = {
  listId: string;
  access: BackofficeAccess;
  categoryCreationModal: CategoryCreationModal;
  productCreationModal: ProductCreationModal;
  filters: SupplierPriceListReviewFilters;
  onFiltersChange: (filters: SupplierPriceListReviewFilters) => void;
  onBack: () => void;
  onSessionEnded: () => void;
  services: SupplierPriceListReviewScreenServices;
};

type ShowFilter = SupplierPriceListReviewFilters["show"];
type Notice =
  | "priceSaved"
  | "rowRemoved"
  | "rowLinked"
  | "rowLinkedUntilConfirmed"
  | "rowReviewed"
  | "productCreated";
type ErrorNotice = "listChanged" | "rowNotReviewed";

const NO_ROWS: SupplierPriceListRow[] = [];

const SHOW_FILTER_OPTIONS = [
  { value: "review" as const, label: "Para revisar" },
  { value: "all" as const, label: "Todos" },
  { value: "unpriced" as const, label: "Sin precio" },
] as const;

const NOTICES: Record<Notice, { title: string; description: string }> = {
  priceSaved: { title: "Precio guardado", description: "Queda en la lista hasta que se confirme." },
  rowRemoved: { title: "Ítem quitado", description: "Ya no forma parte de la lista." },
  rowLinked: {
    title: "Ítem vinculado",
    description: "Las próximas listas del proveedor lo reconocen solas.",
  },
  rowLinkedUntilConfirmed: {
    title: "Ítem vinculado",
    description: "Se recuerda para las próximas listas al confirmar esta.",
  },
  productCreated: {
    title: "Producto creado",
    description: "El ítem quedó vinculado al producto nuevo.",
  },
  rowReviewed: {
    title: "Ítem revisado",
    description: "Ya no figura entre los ítems para revisar.",
  },
};

const ERROR_NOTICES = {
  listChanged: {
    title: "La lista cambió",
    description: "La actualizamos. Volvé a intentarlo.",
  },
  rowNotReviewed: { title: "No se marcó el ítem", description: "Volvé a intentarlo." },
} as const;

function footerText(
  rowCount: number,
  firstShown: number,
  lastShown: number,
  unpricedRowCount: number,
  review: SupplierPriceListReview | null,
): string {
  const { needingReview = 0, linkedAutomatically = 0 } = review?.counts ?? {};
  return [
    `${formatNumber(firstShown)} a ${formatNumber(lastShown)} de ${formatNumber(rowCount)} ítems`,
    needingReview === 0 ? null : `${formatNumber(needingReview)} para revisar`,
    linkedAutomatically === 0
      ? null
      : `${formatNumber(linkedAutomatically)} ${plural(linkedAutomatically, {
          one: "vinculado",
          other: "vinculados",
        })} de listas anteriores`,
    unpricedRowCount === 0 ? null : `${formatNumber(unpricedRowCount)} sin precio`,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

export function SupplierPriceListReviewScreen({
  listId,
  access,
  categoryCreationModal,
  productCreationModal,
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
  const sendToMyAccount = useSendToMyAccount();
  const [search, setSearch] = useState(filters.search);
  const [show, setShow] = useState<ShowFilter>(filters.show);
  const [page, setPage] = useState(1);
  const [priceTarget, setPriceTarget] = useState<SupplierPriceListRow | null>(null);
  const [linkTarget, setLinkTarget] = useState<SupplierPriceListRow | null>(null);
  const [createTarget, setCreateTarget] = useState<SupplierPriceListRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<SupplierPriceListRow | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<SupplierPriceListReviewList | null>(null);
  const [discardTarget, setDiscardTarget] = useState<SupplierPriceListReviewList | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
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
  const mayCreateProducts = actions?.linkRows === true;
  const unread = list?.state === "READING" || list?.state === "READ_FAILED";

  const columns = [
    dataColumn({
      id: "item",
      header: "Ítem del proveedor",
      render: (row: SupplierPriceListRow) => <RowItemCell row={row} />,
    }),
    dataColumn({
      id: "price",
      header: "Precio",
      align: "end",
      render: (row: SupplierPriceListRow) => <RowPriceCell row={row} />,
    }),
    dataColumn({
      id: "link",
      header: "Producto del catálogo",
      render: (row: SupplierPriceListRow) => <RowLinkCell row={row} />,
    }),
    dataColumn({
      id: "status",
      header: "Estado",
      render: (row: SupplierPriceListRow) => <RowStatusCell row={row} />,
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (row: SupplierPriceListRow) =>
          actions?.linkRows
            ? {
                icon: <Link2 />,
                "aria-label":
                  row.link === null
                    ? `Vincular ${row.description}`
                    : `Cambiar el vínculo de ${row.description}`,
                onPress: () => setLinkTarget(row),
              }
            : undefined,
        (row: SupplierPriceListRow) =>
          mayCreateProducts && row.mayCreateProduct
            ? {
                icon: <PackagePlus />,
                "aria-label": `Crear producto ${row.description}`,
                onPress: () => setCreateTarget(row),
              }
            : undefined,
        (row: SupplierPriceListRow) =>
          actions?.markRowsReviewed && row.needsReview
            ? {
                icon: <Check />,
                "aria-label": `Marcar como revisado ${row.description}`,
                onPress: () => void markReviewed(row),
              }
            : undefined,
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
    filter: (row) =>
      show === "all" || (show === "review" ? row.needsReview : row.priceCents === null),
    columns,
    paging: { page, onPageChange: setPage },
  });
  const rowCount = table.getRowCount();
  const { pageIndex, pageSize } = table.state.pagination;
  const firstShown = pageIndex * pageSize + 1;
  const lastShown = Math.min(firstShown + pageSize - 1, rowCount);

  async function markReviewed(row: SupplierPriceListRow) {
    if (list === null) {
      return;
    }
    const outcome = await services.markSupplierPriceListRowReviewed(list.id, row.id, {
      version: list.version,
    });
    if (outcome.kind === "ok") {
      refreshAfter("rowReviewed");
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else {
      const outdated =
        outcome.kind === "stale_version" ||
        outcome.kind === "not_editable" ||
        outcome.kind === "not_found";
      if (outdated) {
        void refreshPurchasing();
      }
      setNotice(null);
      setErrorNotice(outdated ? "listChanged" : "rowNotReviewed");
    }
  }

  function refreshAfter(shown: Notice | null) {
    setLinkTarget(null);
    setCreateTarget(null);
    setErrorNotice(null);
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
                  {list.source.kind === "WEB_PAGE" ? (
                    <ButtonLink
                      variant="text"
                      icon={<ExternalLink />}
                      href={list.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir la página
                    </ButtonLink>
                  ) : (
                    <ButtonLink
                      variant="text"
                      icon={<Download />}
                      href={`/api/supplier-price-lists/${list.id}/file`}
                      download
                    >
                      Descargar el PDF
                    </ButtonLink>
                  )}
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
        {list !== null && canSeeBranchArea(access) ? (
          <SupplierPriceListAiCost
            listId={list.id}
            services={services}
            onSessionEnded={onSessionEnded}
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
                      {footerText(rowCount, firstShown, lastShown, list.unpricedRowCount, review)}
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
          <LinkSupplierItemModal
            list={list}
            target={linkTarget}
            mayCreatePackaging={canManagePurchasePackagings(access)}
            {...(canManageProductsAndCategories(access) ? { productCreationModal } : {})}
            remembersOnConfirm={actions?.confirm === true}
            onCreateProduct={
              mayCreateProducts
                ? (row) => {
                    setLinkTarget(null);
                    setCreateTarget(row);
                  }
                : null
            }
            services={services}
            onLinked={() =>
              refreshAfter(actions?.confirm === true ? "rowLinkedUntilConfirmed" : "rowLinked")
            }
            onOutdated={() => refreshAfter(null)}
            onClose={() => setLinkTarget(null)}
            onSessionEnded={onSessionEnded}
          />
          <CreateProductFromSupplierItemModal
            list={list}
            target={createTarget}
            mayCreateCatalogRecords={canManageProductsAndCategories(access)}
            categoryCreationModal={categoryCreationModal}
            services={services}
            onCreated={() => refreshAfter("productCreated")}
            onOutdated={() => refreshAfter(null)}
            onClose={() => setCreateTarget(null)}
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
      {errorNotice === null ? null : (
        <FloatingNotification
          tone="error"
          icon={<TriangleAlert />}
          title={ERROR_NOTICES[errorNotice].title}
          description={ERROR_NOTICES[errorNotice].description}
          onDismiss={() => setErrorNotice(null)}
        />
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
