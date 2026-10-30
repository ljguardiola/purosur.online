import type { SupplierPriceListSummary } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  FloatingNotification,
  formatNumber,
  ListFilter,
  plural,
  SearchField,
  StatusIndicator,
  Table,
  useTableModel,
} from "@purosur/ui";
import { useMutation } from "@tanstack/react-query";
import { deepEqual } from "@tanstack/react-router";
import { Check, Eye, FileText, RefreshCw, Search, SearchX, Upload } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { AreaTopBar } from "../shell/area-top-bar";
import { type BackofficeAccess, canManageSuppliers } from "../shell/backoffice-access";
import { ScreenLayout } from "../shell/screen-layout";
import { useRefreshPurchasing, useSupplierPriceListsQuery } from "./purchasing-queries";
import { type ReadNotice, readNoticeContent } from "./supplier-price-list-read-notice";
import { supplierPriceListOriginOf } from "./supplier-price-list-source";
import { supplierPriceListStatusOf } from "./supplier-price-list-status";
import type { ReadSupplierPriceListWebPageOutcome } from "./supplier-price-lists-api";
import type { SupplierPriceListsFilters } from "./supplier-price-lists-filters";
import type { SupplierPriceListsScreenServices } from "./supplier-price-lists-services";
import { UploadSupplierPriceListModal } from "./upload-supplier-price-list-modal";

export type SupplierPriceListsScreenProps = {
  access: BackofficeAccess;
  filters: SupplierPriceListsFilters;
  onFiltersChange: (filters: SupplierPriceListsFilters) => void;
  onOpenReview: (listId: string) => void;
  onSessionEnded: () => void;
  services: SupplierPriceListsScreenServices;
};

type StateFilter = SupplierPriceListsFilters["state"];

const NO_LISTS: SupplierPriceListSummary[] = [];
const UNSET = "—";

const STATE_FILTER_OPTIONS = [
  { value: "ALL" as const, label: "Todas" },
  { value: "EXTRACTED" as const, label: "Para revisar" },
  { value: "READING" as const, label: "Leyendo" },
  { value: "READ_FAILED" as const, label: "No se pudo leer" },
  { value: "REVIEWED" as const, label: "Revisadas" },
  { value: "DISCARDED" as const, label: "Descartadas" },
] as const;

function itemsOf(list: SupplierPriceListSummary): string {
  return list.state === "READING" || list.state === "READ_FAILED"
    ? UNSET
    : formatNumber(list.rowCount);
}

function readNoticeOf(
  outcome: Exclude<
    ReadSupplierPriceListWebPageOutcome,
    { kind: "ok" | "unauthenticated" | "forbidden" }
  >,
): ReadNotice {
  switch (outcome.kind) {
    case "daily_cap_reached":
      return { kind: "dailyCapReached" };
    case "supplier_inactive":
      return { kind: "refreshedSupplierInactive" };
    case "supplier_not_found":
      return { kind: "refreshedSupplierNotFound" };
    case "reading_unavailable":
      return { kind: "readingUnavailable" };
    case "page_refused":
      return { kind: "pageRefused", reason: outcome.reason };
    case "rate_limited":
      return { kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds };
    case "validation_failed":
    case "not_found":
    case "not_a_web_page":
    case "failed":
      return { kind: "attemptFailed" };
  }
}

export function SupplierPriceListsScreen({
  access,
  filters,
  onFiltersChange,
  onOpenReview,
  onSessionEnded,
  services,
}: SupplierPriceListsScreenProps) {
  const data = useSupplierPriceListsQuery({
    fetchSupplierPriceLists: services.fetchSupplierPriceLists,
    onSessionEnded,
  });
  const refreshPurchasing = useRefreshPurchasing();
  const sendToMyAccount = useSendToMyAccount();
  const [search, setSearch] = useState(filters.search);
  const [stateFilter, setStateFilter] = useState<StateFilter>(filters.state);
  const [upload, setUpload] = useState<{ supplierId: string | null } | null>(null);
  const [notice, setNotice] = useState<ReadNotice | "loaded" | null>(null);
  const [refreshing, setRefreshing] = useState<ReadonlySet<string>>(new Set());
  const refresh = useMutation({
    mutationFn: (listId: string) => services.refreshSupplierPriceList(listId),
    onSettled: (_outcome, _error, listId) => {
      setRefreshing((ids) => new Set([...ids].filter((id) => id !== listId)));
    },
    onSuccess: (outcome) => {
      switch (outcome.kind) {
        case "ok":
          setNotice("loaded");
          void refreshPurchasing();
          return;
        case "unauthenticated":
          onSessionEnded();
          return;
        case "forbidden":
          sendToMyAccount();
          return;
        default:
          setNotice(readNoticeOf(outcome));
      }
    },
  });
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: SupplierPriceListsFilters = { search, state: stateFilter };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, stateFilter, filters]);

  const lists = data.status === "loaded" ? data.value : NO_LISTS;

  const columns = [
    dataColumn({
      id: "supplier",
      header: "Proveedor",
      render: (item: SupplierPriceListSummary) => item.supplier.name,
    }),
    dataColumn({
      id: "source",
      header: "Origen",
      render: (item: SupplierPriceListSummary) => {
        const origin = supplierPriceListOriginOf(item.source);
        return (
          <div className="flex flex-col">
            <span>{origin.name}</span>
            <span className="text-detail text-text-subtle">{origin.detail}</span>
          </div>
        );
      },
    }),
    dataColumn({
      id: "date",
      header: "Fecha de la lista",
      render: (item: SupplierPriceListSummary) =>
        item.listDate === null ? UNSET : formatDisplayDate(item.listDate),
    }),
    dataColumn({
      id: "items",
      header: "Ítems",
      render: itemsOf,
    }),
    dataColumn({
      id: "state",
      header: "Estado",
      render: (item: SupplierPriceListSummary) => {
        const status = supplierPriceListStatusOf(item);
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusIndicator tone={status.tone} busy={status.busy}>
              {status.label}
            </StatusIndicator>
            {status.reason === undefined ? null : (
              <span className="text-detail text-text-subtle">{status.reason}</span>
            )}
          </div>
        );
      },
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: SupplierPriceListSummary) =>
          item.source.kind === "WEB_PAGE" && item.state !== "READING"
            ? {
                icon: <RefreshCw />,
                "aria-label": `Actualizar la lista de ${item.supplier.name}`,
                onPress: () => {
                  if (!refreshing.has(item.id)) {
                    setRefreshing((ids) => new Set([...ids, item.id]));
                    refresh.mutate(item.id);
                  }
                },
              }
            : undefined,
        (item: SupplierPriceListSummary) =>
          item.state === "READING"
            ? undefined
            : {
                icon: <Eye />,
                "aria-label": `Abrir la lista de ${item.supplier.name}`,
                onPress: () => onOpenReview(item.id),
              },
        (item: SupplierPriceListSummary) =>
          item.state === "READ_FAILED" && item.source.kind === "PDF"
            ? {
                icon: <Upload />,
                "aria-label": `Cargar de nuevo la lista de ${item.supplier.name}`,
                onPress: () => setUpload({ supplierId: item.supplier.id }),
              }
            : undefined,
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: lists,
    id: (list) => list.id,
    search: {
      text: search,
      in: (list) => [list.supplier.name, supplierPriceListOriginOf(list.source).name],
    },
    filter: (list) => stateFilter === "ALL" || list.state === stateFilter,
    columns,
  });
  const shownCount = table.getRowModel().rows.length;

  return (
    <>
      <ScreenLayout
        topBar={
          <AreaTopBar
            eyebrow="Pedidos"
            title="Listas de proveedores"
            action={
              <Button
                variant="primary"
                icon={<Upload />}
                onPress={() => setUpload({ supplierId: null })}
              >
                Cargar una lista
              </Button>
            }
          />
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-105">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar un proveedor"
              icon={<Search />}
            />
          </div>
          <ListFilter
            name="state"
            label="Estado:"
            options={STATE_FILTER_OPTIONS}
            value={stateFilter}
            onChange={setStateFilter}
          />
        </div>
        <Table
          aria-label="Listas de proveedores"
          table={table}
          {...cloudTableState(data, "las listas de proveedores")}
          empty={
            lists.length === 0
              ? {
                  icon: <FileText />,
                  title: "Todavía no hay listas cargadas",
                  variant: "blank",
                }
              : { icon: <SearchX />, title: "Sin resultados", variant: "filtered" }
          }
          footer={
            shownCount === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {plural(shownCount, { one: "1 lista", other: `${shownCount} listas` })}
              </p>
            )
          }
        />
      </ScreenLayout>
      <UploadSupplierPriceListModal
        open={upload !== null}
        initialSupplierId={upload?.supplierId ?? null}
        mayCreateSupplier={canManageSuppliers(access)}
        services={services}
        onUploaded={() => {
          setUpload(null);
          setNotice("loaded");
          void refreshPurchasing();
        }}
        onClose={() => setUpload(null)}
        onSessionEnded={onSessionEnded}
      />
      {notice === "loaded" ? (
        <FloatingNotification
          tone="success"
          icon={<Check />}
          title="Lista cargada"
          description="Se está leyendo. Cuando termine, se puede revisar."
          onDismiss={() => setNotice(null)}
        />
      ) : notice === null ? null : (
        <FloatingNotification {...readNoticeContent(notice)} onDismiss={() => setNotice(null)} />
      )}
    </>
  );
}
