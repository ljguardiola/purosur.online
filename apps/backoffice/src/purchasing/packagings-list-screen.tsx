import type { PackagingSummary } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  type ItemOrder,
  ListFilter,
  SearchField,
  StatusIndicator,
  Table,
  type TableSort,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Ban, Package, Pencil, Plus, RotateCcw, Search, SearchX } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatStockQuantity } from "../platform/stock-quantity";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { DeactivatePackagingModal } from "./deactivate-packaging-modal";
import { EditPackagingModal } from "./edit-packaging-modal";
import { NewPackagingModal } from "./new-packaging-modal";
import type { PackagingsListScreenServices } from "./packagings-list-services";
import { usePackagingsQuery, useRefreshPurchasing, useReloadPackaging } from "./purchasing-queries";
import { ReactivatePackagingModal } from "./reactivate-packaging-modal";
import type { PackagingsListFilters } from "./routes";

export type PackagingsListScreenProps = {
  filters: PackagingsListFilters;
  onFiltersChange: (filters: PackagingsListFilters) => void;
  onSessionEnded: () => void;
  services: PackagingsListScreenServices;
};

type PackagingStatusFilter = PackagingsListFilters["status"];

const NO_PACKAGINGS: PackagingSummary[] = [];
const NO_PRODUCTS: never[] = [];

const PACKAGING_STATUS_EMPTY_TITLE = {
  active: "No hay presentaciones activas",
  inactive: "No hay presentaciones inactivas",
  all: "Sin resultados",
} satisfies Record<PackagingStatusFilter, string>;

const productNameOrder = textOrder((packaging: PackagingSummary) => packaging.productName);
const packagingNameOrder = textOrder((packaging: PackagingSummary) => packaging.name);

const productOrder: ItemOrder<PackagingSummary> = (a, b) =>
  productNameOrder(a, b) || packagingNameOrder(a, b);

function showsStatus(packaging: PackagingSummary, status: PackagingStatusFilter): boolean {
  return status === "all" || packaging.active === (status === "active");
}

export function PackagingsListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: PackagingsListScreenProps) {
  const data = usePackagingsQuery({ fetchPackagings: services.fetchPackagings, onSessionEnded });
  const refreshPurchasing = useRefreshPurchasing();
  const reloadPackaging = useReloadPackaging({ fetchPackagings: services.fetchPackagings });
  const [search, setSearch] = useState(filters.search);
  const [statusFilter, setStatusFilter] = useState<PackagingStatusFilter>(filters.status);
  const [sort, setSort] = useState<TableSort<"product">>({
    column: "product",
    direction: filters.sort,
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PackagingSummary | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<PackagingSummary | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<PackagingSummary | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: PackagingsListFilters = { search, status: statusFilter, sort: sort.direction };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, statusFilter, sort.direction, filters]);

  useEffect(() => {
    if (data.status === "failed") {
      setEditTarget(null);
    }
  }, [data.status]);

  const { packagings, products } =
    data.status === "loaded" ? data.value : { packagings: NO_PACKAGINGS, products: NO_PRODUCTS };

  const statusFilterOptions = [
    { value: "active" as const, label: "Activas" },
    { value: "inactive" as const, label: "Inactivas" },
    { value: "all" as const, label: "Todas" },
  ] as const;

  const columns = [
    dataColumn({
      id: "product",
      header: "Producto",
      sort: { order: productOrder, firstDirection: "ascending" },
      render: (item: PackagingSummary) => item.productName,
    }),
    dataColumn({
      id: "packaging",
      header: "Presentación",
      render: (item: PackagingSummary) => item.name,
    }),
    dataColumn({
      id: "quantity",
      header: "Cantidad por presentación",
      render: (item: PackagingSummary) =>
        formatStockQuantity(item.quantityPerPackage, item.saleUnit),
    }),
    dataColumn({
      id: "status",
      header: "Estado",
      render: (item: PackagingSummary) =>
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
        (item: PackagingSummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar la presentación ${item.name}`,
          onPress: () => setEditTarget(item),
        }),
        (item: PackagingSummary) =>
          item.active
            ? {
                icon: <Ban />,
                "aria-label": `Desactivar la presentación ${item.name}`,
                onPress: () => setDeactivateTarget(item),
              }
            : {
                icon: <RotateCcw />,
                "aria-label": `Reactivar la presentación ${item.name}`,
                onPress: () => setReactivateTarget(item),
              },
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: packagings,
    id: (packaging) => packaging.id,
    search: { text: search, in: (packaging) => [packaging.productName, packaging.name] },
    filter: (packaging) => showsStatus(packaging, statusFilter),
    columns,
    sort,
    onSortChange: setSort,
  });

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Stock</p>
              <ScreenTitle>Presentaciones de compra</ScreenTitle>
            </div>
            <Button
              variant="primary"
              icon={<Plus />}
              dataStatus={data.status}
              onPress={() => setNewModalOpen(true)}
            >
              Nueva presentación
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
              placeholder="Buscar una presentación"
              icon={<Search />}
            />
          </div>
          <ListFilter
            name="status"
            label="Estado:"
            options={statusFilterOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <Table
          aria-label="Presentaciones de compra"
          table={table}
          {...cloudTableState(data, "las presentaciones")}
          empty={
            packagings.length === 0
              ? {
                  icon: <Package />,
                  title: "Todavía no hay presentaciones de compra",
                  description: "Se cargan para registrar en qué formato se compra cada producto.",
                  variant: "blank",
                }
              : search.trim() === ""
                ? {
                    icon: <SearchX />,
                    title: PACKAGING_STATUS_EMPTY_TITLE[statusFilter],
                    variant: "filtered",
                  }
                : {
                    icon: <SearchX />,
                    title: "Sin resultados",
                    description: "Probá con otro nombre.",
                    variant: "filtered",
                  }
          }
        />
      </ScreenLayout>
      <NewPackagingModal
        open={newModalOpen}
        products={products}
        services={services}
        onCreated={() => {
          setNewModalOpen(false);
          void refreshPurchasing();
        }}
        onClose={() => setNewModalOpen(false)}
        onSessionEnded={onSessionEnded}
      />
      {data.status === "loaded" ? (
        <EditPackagingModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refreshPurchasing();
          }}
          onSessionEnded={onSessionEnded}
          reload={reloadPackaging}
          services={services}
        />
      ) : null}
      <DeactivatePackagingModal
        target={deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onDeactivated={() => {
          setDeactivateTarget(null);
          void refreshPurchasing();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <ReactivatePackagingModal
        target={reactivateTarget}
        onClose={() => setReactivateTarget(null)}
        onReactivated={() => {
          setReactivateTarget(null);
          void refreshPurchasing();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
    </>
  );
}
