import type { FreightSummary } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  formatCents,
  formatNumber,
  ListFilter,
  plural,
  SearchField,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Pencil, Plus, Search, SearchX, Truck } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { ScreenLayout } from "../shell/screen-layout";
import { StockTopBar } from "../shell/stock-top-bar";
import { EditFreightModal } from "./edit-freight-modal";
import { freightPeriodOf, freightPeriodOptions } from "./freight-form";
import type { FreightsListScreenServices } from "./freights-list-services";
import { NewFreightModal } from "./new-freight-modal";
import { useFreightsQuery, useRefreshPurchasing } from "./purchasing-queries";
import type { FreightsListFilters } from "./routes";

export type FreightsListScreenProps = {
  filters: FreightsListFilters;
  onFiltersChange: (filters: FreightsListFilters) => void;
  onSessionEnded: () => void;
  services: FreightsListScreenServices;
};

const NO_FREIGHTS: FreightSummary[] = [];
const SEARCH_DEBOUNCE_MS = 300;

function meansLabel(freight: FreightSummary): string {
  return freight.means.kind === "carrier" ? freight.means.name : "Viaje propio · costo estimado";
}

function supplierNames(freight: FreightSummary): string {
  return [...new Set(freight.purchases.map((purchase) => purchase.supplier.name))].join(" · ");
}

export function FreightsListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: FreightsListScreenProps) {
  const refreshPurchasing = useRefreshPurchasing();
  const [search, setSearch] = useState(filters.search);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search.trim());
  const [period, setPeriod] = useState(filters.period);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FreightSummary | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: FreightsListFilters = { search, period };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, period, filters]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search]);

  const data = useFreightsQuery({
    input: { period, search: debouncedSearch },
    fetchFreights: services.fetchFreights,
    onSessionEnded,
  });

  useEffect(() => {
    if (data.status === "failed") {
      setEditTarget(null);
    }
  }, [data.status]);

  const freights = data.status === "loaded" ? data.value : undefined;

  const columns = [
    dataColumn({
      id: "date",
      header: "Fecha",
      render: (item: FreightSummary) => <TableCellText strong>{formatDisplayDate(item.date)}</TableCellText>,
    }),
    dataColumn({
      id: "freight",
      header: "Flete",
      render: (item: FreightSummary) => (
        <TableCellText description={meansLabel(item)}>{item.description}</TableCellText>
      ),
    }),
    dataColumn({
      id: "purchases",
      header: "Compras vinculadas",
      render: (item: FreightSummary) => (
        <TableCellText description={supplierNames(item)}>
          {plural(item.purchases.length, {
            one: "1 compra",
            other: `${formatNumber(item.purchases.length)} compras`,
          })}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "amount",
      header: "Monto",
      render: (item: FreightSummary) => (
        <TableCellText strong>{formatCents(item.amountCents)}</TableCellText>
      ),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: FreightSummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar el flete ${item.description}`,
          onPress: () => setEditTarget(item),
        }),
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: freights?.items ?? NO_FREIGHTS,
    id: (freight) => freight.id,
    columns,
  });

  return (
    <>
      <ScreenLayout
        topBar={
          <StockTopBar
            title="Flete"
            action={
              <Button variant="primary" icon={<Plus />} onPress={() => setNewModalOpen(true)}>
                Nuevo flete
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
              placeholder="Buscar por descripción o medio"
              icon={<Search />}
            />
          </div>
          <ListFilter
            name="period"
            label="Período:"
            options={freightPeriodOptions}
            value={String(period)}
            onChange={(value) => setPeriod(freightPeriodOf(value) ?? period)}
          />
        </div>
        <Table
          aria-label="Fletes"
          table={table}
          {...cloudTableState(data, "los fletes")}
          empty={
            debouncedSearch === ""
              ? {
                  icon: <Truck />,
                  title: `Sin fletes en los últimos ${formatNumber(period)} días`,
                  description: "Un flete se vincula a una o varias compras.",
                  variant: "blank",
                }
              : {
                  icon: <SearchX />,
                  title: "Sin resultados",
                  description: "Probá con otra descripción o medio.",
                  variant: "filtered",
                }
          }
          footer={
            freights === undefined || freights.count === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {plural(freights.count, {
                  one: "1 flete",
                  other: `${formatNumber(freights.count)} fletes`,
                })}
                {" · "}
                {formatCents(freights.totalCents)}
              </p>
            )
          }
        />
      </ScreenLayout>
      <NewFreightModal
        open={newModalOpen}
        period={period}
        services={services}
        onRecorded={() => {
          setNewModalOpen(false);
          void refreshPurchasing();
        }}
        onClose={() => setNewModalOpen(false)}
        onSessionEnded={onSessionEnded}
      />
      {data.status === "loaded" ? (
        <EditFreightModal
          target={editTarget}
          period={period}
          services={services}
          onSaved={() => {
            setEditTarget(null);
            void refreshPurchasing();
          }}
          onClose={() => setEditTarget(null)}
          onSessionEnded={onSessionEnded}
        />
      ) : null}
    </>
  );
}
