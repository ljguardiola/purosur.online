import type { AssemblyBatch, RecipeSummary } from "@purosur/contracts";
import {
  actionsColumn,
  Button,
  dataColumn,
  FloatingNotification,
  ListFilter,
  SearchField,
  Table,
  TableCellText,
  Tag,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { deepEqual } from "@tanstack/react-router";
import { Ban, Check, CookingPot, Plus, Search, SearchX } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatStockQuantity } from "../platform/stock-quantity";
import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import {
  assemblyBatchesCountText,
  BATCH_COST_INCOMPLETE,
  BATCH_WITHOUT_EXPIRY,
  batchExpiryText,
  batchUnitCostText,
} from "./assembly-batch-text";
import type { AssemblyBatchesScreenServices } from "./assembly-batches-services";
import { NewAssemblyBatchModal } from "./new-assembly-batch-modal";
import type { AssemblyBatchesFilters } from "./routes";
import {
  formatStockDay,
  formatStockTime,
  periodDays,
  STOCK_PERIOD_OPTIONS,
  type StockPeriod,
} from "./stock-period";
import { useAssemblyBatchesQuery, useRefreshStock } from "./stock-queries";
import { VoidAssemblyBatchModal } from "./void-assembly-batch-modal";

export type AssemblyBatchesScreenProps = {
  filters: AssemblyBatchesFilters;
  onFiltersChange: (filters: AssemblyBatchesFilters) => void;
  onSessionEnded: () => void;
  services: AssemblyBatchesScreenServices;
};

type ScreenNotice = { id: number; title: string; description: string };

const NO_BATCHES: AssemblyBatch[] = [];
const NO_RECIPES: RecipeSummary[] = [];

export function AssemblyBatchesScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: AssemblyBatchesScreenProps) {
  const [search, setSearch] = useState(filters.search);
  const [period, setPeriod] = useState<StockPeriod>(filters.period);
  const [modalOpen, setModalOpen] = useState(false);
  const [voiding, setVoiding] = useState<AssemblyBatch | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);
  const refreshStock = useRefreshStock();
  const days = periodDays(period);
  const data = useAssemblyBatchesQuery({
    days,
    fetchAssemblyBatches: services.fetchAssemblyBatches,
    onSessionEnded,
  });

  useEffect(() => {
    const shown: AssemblyBatchesFilters = { search, period };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, period, filters]);

  useEffect(() => {
    if (data.status === "failed") {
      setModalOpen(false);
    }
  }, [data.status]);

  const { batches, recipes } =
    data.status === "loaded" ? data.value : { batches: NO_BATCHES, recipes: NO_RECIPES };

  const columns = [
    dataColumn({
      id: "date",
      header: "Fecha",
      render: (batch: AssemblyBatch) => (
        <TableCellText strong description={formatStockTime(batch.assembledAt)}>
          {formatStockDay(batch.assembledAt)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "product",
      header: "Producto armado",
      render: (batch: AssemblyBatch) => (
        <div className="flex items-center gap-2">
          <TableCellText strong>
            {formatProductDescription({
              name: batch.productName,
              brandName: batch.brandName,
              netContent: batch.netContent,
            })}
          </TableCellText>
          {batch.status === "voided" ? <Tag tone="neutral">Anulada</Tag> : null}
        </div>
      ),
    }),
    dataColumn({
      id: "output",
      header: "Obtenido",
      align: "end",
      render: (batch: AssemblyBatch) => (
        <TableCellText>{formatStockQuantity(batch.output, batch.saleUnit)}</TableCellText>
      ),
    }),
    dataColumn({
      id: "unitCost",
      header: "Costo unitario",
      align: "end",
      render: (batch: AssemblyBatch) => {
        const cost = batchUnitCostText(batch, batch.saleUnit);
        return cost === null ? (
          <TableCellText tone="subtle">{BATCH_COST_INCOMPLETE}</TableCellText>
        ) : (
          <TableCellText>{cost}</TableCellText>
        );
      },
    }),
    dataColumn({
      id: "expiresOn",
      header: "Vence",
      render: (batch: AssemblyBatch) =>
        batch.expiresOn === null ? (
          <TableCellText tone="subtle">{BATCH_WITHOUT_EXPIRY}</TableCellText>
        ) : (
          <TableCellText>{batchExpiryText(batch.expiresOn)}</TableCellText>
        ),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones de la tanda",
      actions: [
        (batch: AssemblyBatch) =>
          batch.status === "voidable"
            ? {
                icon: <Ban />,
                "aria-label": `Anular tanda de ${formatProductDescription({ name: batch.productName, brandName: batch.brandName, netContent: batch.netContent })}`,
                onPress: () => setVoiding(batch),
              }
            : undefined,
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: batches,
    id: (batch) => batch.id,
    search: {
      text: search,
      in: (batch) => [
        formatProductDescription({
          name: batch.productName,
          brandName: batch.brandName,
          netContent: batch.netContent,
        }),
      ],
    },
    columns,
  });
  const matchCount = table.getRowModel().rows.length;

  return (
    <>
      <ScreenLayout
        topBar={
          <AreaTopBar
            eyebrow="Stock"
            title="Tandas"
            action={
              <Button
                variant="primary"
                icon={<Plus />}
                dataStatus={data.status}
                onPress={() => setModalOpen(true)}
              >
                Nueva tanda
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
              placeholder="Buscar un producto armado"
              icon={<Search />}
            />
          </div>
          <ListFilter
            name="period"
            label="Período:"
            options={STOCK_PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
          />
        </div>
        <Table
          aria-label="Tandas"
          table={table}
          {...cloudTableState(data, "las tandas")}
          empty={
            batches.length === 0
              ? {
                  icon: <CookingPot />,
                  title: `Sin tandas en los últimos ${days} días`,
                  description: "Cada tanda registra lo que se usó y lo que se obtuvo.",
                  variant: "blank",
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
                {assemblyBatchesCountText(matchCount, days)}
              </p>
            )
          }
        />
      </ScreenLayout>
      {modalOpen && data.status === "loaded" ? (
        <NewAssemblyBatchModal
          recipes={recipes}
          services={services}
          onRegistered={(_batch, recipe) => {
            setModalOpen(false);
            setNotice((previous) => ({
              id: (previous?.id ?? 0) + 1,
              title: "Tanda registrada",
              description: `Se registró una tanda de ${formatProductDescription({ name: recipe.productName, brandName: recipe.brandName, netContent: recipe.netContent })}.`,
            }));
            void refreshStock();
          }}
          onClose={() => setModalOpen(false)}
          onSessionEnded={onSessionEnded}
        />
      ) : null}
      {voiding ? (
        <VoidAssemblyBatchModal
          batch={voiding}
          services={services}
          onVoided={() => {
            setVoiding(null);
            setNotice((previous) => ({
              id: (previous?.id ?? 0) + 1,
              title: "Tanda anulada",
              description: `Se anuló la tanda de ${formatProductDescription({ name: voiding.productName, brandName: voiding.brandName, netContent: voiding.netContent })}.`,
            }));
            void refreshStock();
          }}
          onOutdated={() => {
            setVoiding(null);
            void refreshStock();
          }}
          onClose={() => setVoiding(null)}
          onSessionEnded={onSessionEnded}
        />
      ) : null}
      {notice ? (
        <FloatingNotification
          key={notice.id}
          tone="success"
          icon={<Check />}
          title={notice.title}
          description={notice.description}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
    </>
  );
}
