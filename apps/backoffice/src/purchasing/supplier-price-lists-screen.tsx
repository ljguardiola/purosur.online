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
import { deepEqual } from "@tanstack/react-router";
import { Check, Eye, FileText, Search, SearchX, Upload } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import { useRefreshPurchasing, useSupplierPriceListsQuery } from "./purchasing-queries";
import { supplierPriceListStatusOf } from "./supplier-price-list-status";
import type { SupplierPriceListsFilters } from "./supplier-price-lists-filters";
import type { SupplierPriceListsScreenServices } from "./supplier-price-lists-services";
import { UploadSupplierPriceListModal } from "./upload-supplier-price-list-modal";

export type SupplierPriceListsScreenProps = {
  filters: SupplierPriceListsFilters;
  onFiltersChange: (filters: SupplierPriceListsFilters) => void;
  onOpenReview: (listId: string) => void;
  onSessionEnded: () => void;
  services: SupplierPriceListsScreenServices;
};

type StateFilter = SupplierPriceListsFilters["state"];

const NO_LISTS: SupplierPriceListSummary[] = [];
const UNSET = "—";

const SOURCE_KIND_LABEL = { PDF: "PDF" } satisfies Record<
  SupplierPriceListSummary["sourceKind"],
  string
>;

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

export function SupplierPriceListsScreen({
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
  const [search, setSearch] = useState(filters.search);
  const [stateFilter, setStateFilter] = useState<StateFilter>(filters.state);
  const [upload, setUpload] = useState<{ supplierId: string | null } | null>(null);
  const [uploaded, setUploaded] = useState(false);
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
      render: (item: SupplierPriceListSummary) => (
        <div className="flex flex-col">
          <span>{item.fileName}</span>
          <span className="text-detail text-text-subtle">{SOURCE_KIND_LABEL[item.sourceKind]}</span>
        </div>
      ),
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
          item.state === "READING"
            ? undefined
            : {
                icon: <Eye />,
                "aria-label": `Abrir la lista de ${item.supplier.name}`,
                onPress: () => onOpenReview(item.id),
              },
        (item: SupplierPriceListSummary) =>
          item.state === "READ_FAILED"
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
    search: { text: search, in: (list) => [list.supplier.name, list.fileName] },
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
        services={services}
        onUploaded={() => {
          setUpload(null);
          setUploaded(true);
          void refreshPurchasing();
        }}
        onClose={() => setUpload(null)}
        onSessionEnded={onSessionEnded}
      />
      {uploaded ? (
        <FloatingNotification
          tone="success"
          icon={<Check />}
          title="Lista cargada"
          description="Se está leyendo. Cuando termine, se puede revisar."
          onDismiss={() => setUploaded(false)}
        />
      ) : null}
    </>
  );
}
