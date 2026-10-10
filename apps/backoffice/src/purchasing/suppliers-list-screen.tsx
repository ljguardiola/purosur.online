import type { SupplierSummary } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  ListFilter,
  SearchField,
  StatusIndicator,
  Table,
  type TableSort,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Ban, Pencil, Plus, RotateCcw, Search, SearchX, Truck } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import { StockTopBar } from "../shell/stock-top-bar";
import { DeactivateSupplierModal } from "./deactivate-supplier-modal";
import { EditSupplierModal } from "./edit-supplier-modal";
import { NewSupplierModal } from "./new-supplier-modal";
import { useRefreshPurchasing, useReloadSupplier, useSuppliersQuery } from "./purchasing-queries";
import { ReactivateSupplierModal } from "./reactivate-supplier-modal";
import type { SuppliersListFilters } from "./routes";
import type { SuppliersListScreenServices } from "./suppliers-list-services";

export type SuppliersListScreenProps = {
  filters: SuppliersListFilters;
  onFiltersChange: (filters: SuppliersListFilters) => void;
  onSessionEnded: () => void;
  services: SuppliersListScreenServices;
};

type SupplierStatusFilter = SuppliersListFilters["status"];

const NO_SUPPLIERS: SupplierSummary[] = [];
const UNSET = "—";

const SUPPLIER_STATUS_EMPTY_TITLE = {
  active: "No hay proveedores activos",
  inactive: "No hay proveedores inactivos",
  all: "Sin resultados",
} satisfies Record<SupplierStatusFilter, string>;

const supplierNameOrder = textOrder((supplier: SupplierSummary) => supplier.name);

function showsStatus(supplier: SupplierSummary, status: SupplierStatusFilter): boolean {
  return status === "all" || supplier.active === (status === "active");
}

export function SuppliersListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: SuppliersListScreenProps) {
  const data = useSuppliersQuery({ fetchSuppliers: services.fetchSuppliers, onSessionEnded });
  const refreshPurchasing = useRefreshPurchasing();
  const reloadSupplier = useReloadSupplier({ fetchSuppliers: services.fetchSuppliers });
  const [search, setSearch] = useState(filters.search);
  const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>(filters.status);
  const [sort, setSort] = useState<TableSort<"supplier">>({
    column: "supplier",
    direction: filters.sort,
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SupplierSummary | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<SupplierSummary | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<SupplierSummary | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: SuppliersListFilters = { search, status: statusFilter, sort: sort.direction };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, statusFilter, sort.direction, filters]);

  useEffect(() => {
    if (data.status === "failed") {
      setEditTarget(null);
    }
  }, [data.status]);

  const suppliers = data.status === "loaded" ? data.value : NO_SUPPLIERS;

  const statusFilterOptions = [
    { value: "active" as const, label: "Activos" },
    { value: "inactive" as const, label: "Inactivos" },
    { value: "all" as const, label: "Todos" },
  ] as const;

  const columns = [
    dataColumn({
      id: "supplier",
      header: "Proveedor",
      sort: { order: supplierNameOrder, firstDirection: "ascending" },
      render: (item: SupplierSummary) => item.name,
    }),
    dataColumn({
      id: "cuit",
      header: "CUIT",
      render: (item: SupplierSummary) => item.cuit ?? UNSET,
    }),
    dataColumn({
      id: "contact",
      header: "Contacto",
      render: (item: SupplierSummary) => item.contact ?? UNSET,
    }),
    dataColumn({
      id: "note",
      header: "Nota",
      render: (item: SupplierSummary) => item.note ?? UNSET,
    }),
    dataColumn({
      id: "status",
      header: "Estado",
      render: (item: SupplierSummary) =>
        item.active ? (
          <StatusIndicator tone="success">Activo</StatusIndicator>
        ) : (
          <StatusIndicator tone="neutral">Inactivo</StatusIndicator>
        ),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: SupplierSummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar el proveedor ${item.name}`,
          onPress: () => setEditTarget(item),
        }),
        (item: SupplierSummary) =>
          item.active
            ? {
                icon: <Ban />,
                "aria-label": `Desactivar el proveedor ${item.name}`,
                onPress: () => setDeactivateTarget(item),
              }
            : {
                icon: <RotateCcw />,
                "aria-label": `Reactivar el proveedor ${item.name}`,
                onPress: () => setReactivateTarget(item),
              },
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: suppliers,
    id: (supplier) => supplier.id,
    search: {
      text: search,
      in: (supplier) => [supplier.name, supplier.cuit ?? "", supplier.contact ?? ""],
    },
    filter: (supplier) => showsStatus(supplier, statusFilter),
    columns,
    sort,
    onSortChange: setSort,
  });

  return (
    <>
      <ScreenLayout
        topBar={
          <StockTopBar
            title="Proveedores"
            action={
              <Button variant="primary" icon={<Plus />} onPress={() => setNewModalOpen(true)}>
                Nuevo proveedor
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
            name="status"
            label="Estado:"
            options={statusFilterOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <Table
          aria-label="Proveedores"
          table={table}
          {...cloudTableState(data, "los proveedores")}
          empty={
            suppliers.length === 0
              ? {
                  icon: <Truck />,
                  title: "Todavía no hay proveedores",
                  description: "Se cargan para registrar a quién se le compra la mercadería.",
                  variant: "blank",
                }
              : search.trim() === ""
                ? {
                    icon: <SearchX />,
                    title: SUPPLIER_STATUS_EMPTY_TITLE[statusFilter],
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
      <NewSupplierModal
        open={newModalOpen}
        services={services}
        onCreated={() => {
          setNewModalOpen(false);
          void refreshPurchasing();
        }}
        onClose={() => setNewModalOpen(false)}
        onSessionEnded={onSessionEnded}
      />
      {data.status === "loaded" ? (
        <EditSupplierModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refreshPurchasing();
          }}
          onSessionEnded={onSessionEnded}
          reload={reloadSupplier}
          services={services}
        />
      ) : null}
      <DeactivateSupplierModal
        target={deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onDeactivated={() => {
          setDeactivateTarget(null);
          void refreshPurchasing();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <ReactivateSupplierModal
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
