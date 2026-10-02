import type { StockMovement, StockMovementResult, StockProduct } from "@purosur/contracts";
import {
  Button,
  dataColumn,
  FloatingNotification,
  ListFilter,
  plural,
  SearchField,
  Table,
  TableCellText,
  Tag,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { ArrowDownUp, Check, Plus, Search } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  type BackofficeAccess,
  canAdjustStock,
  canRecordStockLosses,
  canSeeStockBalances,
} from "../access/backoffice-access";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import type { StockMovementsFilters } from "./routes";
import { MOVEMENT_KINDS, type MovementKind, REASONS_OF_KIND } from "./stock-movement-form";
import { StockMovementModal } from "./stock-movement-modal";
import type { StockMovementsScreenServices } from "./stock-movements-services";
import {
  formatStockDay,
  formatStockTime,
  periodDays,
  STOCK_PERIOD_OPTIONS,
  type StockPeriod,
} from "./stock-period";
import { formatStockChange, formatStockQuantity } from "./stock-quantity";
import { useRefreshStock, useStockMovementsQuery } from "./stock-queries";
import { REASON_LABELS } from "./stock-reason-labels";
import { StockTopBar } from "./stock-screen-parts";

export type StockMovementsScreenProps = {
  access: BackofficeAccess;
  filters: StockMovementsFilters;
  onFiltersChange: (filters: StockMovementsFilters) => void;
  onSessionEnded: () => void;
  services: StockMovementsScreenServices;
};

type ReasonFilter = StockMovementsFilters["reason"];

type ScreenNotice = { id: number; title: string; description: string };

const NO_MOVEMENTS: StockMovement[] = [];

const KIND_LABELS = { loss: "Pérdida", adjustment: "Ajuste" } satisfies Record<
  MovementKind,
  string
>;

const columns = [
  dataColumn({
    id: "date",
    header: "Fecha",
    render: (movement: StockMovement) => (
      <TableCellText description={formatStockTime(movement.occurredAt)}>
        {formatStockDay(movement.occurredAt)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "product",
    header: "Producto",
    render: (movement: StockMovement) => (
      <TableCellText description={movement.categoryName}>{movement.productName}</TableCellText>
    ),
  }),
  dataColumn({
    id: "kind",
    header: "Tipo",
    render: (movement: StockMovement) => (
      <Tag tone={movement.kind === "loss" ? "neutral" : "info"}>{KIND_LABELS[movement.kind]}</Tag>
    ),
  }),
  dataColumn({
    id: "reason",
    header: "Motivo",
    render: (movement: StockMovement) => REASON_LABELS[movement.reason],
  }),
  dataColumn({
    id: "quantity",
    header: "Cantidad",
    align: "end",
    render: (movement: StockMovement) => {
      const change = formatStockChange(movement.delta, movement.saleUnit);
      return movement.superseded ? (
        <div className="flex flex-col items-end gap-1">
          <span>{change}</span>
          <Tag tone="neutral">Superado por un recuento posterior</Tag>
        </div>
      ) : (
        change
      );
    },
  }),
] as const;

function registeredNotice(
  product: StockProduct,
  result: StockMovementResult,
  delta: number,
  showsBalance: boolean,
) {
  const balance = formatStockQuantity(result.balance, product.saleUnit);
  if (result.superseded) {
    return {
      title: "El movimiento no cambió el saldo",
      description: showsBalance
        ? `Hay un recuento posterior de ${product.name}: el saldo sigue en ${balance}.`
        : `Hay un recuento posterior de ${product.name}.`,
    };
  }
  return {
    title: "Saldo actualizado",
    description: showsBalance
      ? `${product.name} queda en ${balance}.`
      : `${product.name}: ${formatStockChange(delta, product.saleUnit)}.`,
  };
}

const MAY_RECORD = {
  loss: canRecordStockLosses,
  adjustment: canAdjustStock,
} satisfies Record<MovementKind, (access: BackofficeAccess) => boolean>;

function allowedKinds(access: BackofficeAccess): readonly MovementKind[] {
  return MOVEMENT_KINDS.filter((kind) => MAY_RECORD[kind](access));
}

function actionLabel(kinds: readonly MovementKind[]): string {
  if (kinds.length > 1) {
    return "Cargar pérdida o ajuste";
  }
  return kinds[0] === "loss" ? "Cargar pérdida" : "Cargar ajuste";
}

export function StockMovementsScreen({
  access,
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: StockMovementsScreenProps) {
  const [search, setSearch] = useState(filters.search);
  const [reason, setReason] = useState<ReasonFilter>(filters.reason);
  const [period, setPeriod] = useState<StockPeriod>(filters.period);
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);
  const reportFilters = useEffectEvent(onFiltersChange);
  const refreshStock = useRefreshStock();
  const kinds = allowedKinds(access);
  const showsBalance = canSeeStockBalances(access);
  const [firstKind] = kinds;

  const reasonOptions: [
    { value: ReasonFilter; label: string },
    ...{ value: ReasonFilter; label: string }[],
  ] = [
    { value: "ALL", label: "Todos" },
    ...kinds
      .flatMap((kind) => REASONS_OF_KIND[kind])
      .map((value) => ({ value, label: REASON_LABELS[value] })),
  ];
  const reasonIsOffered = reasonOptions.some((option) => option.value === reason);

  useEffect(() => {
    if (!reasonIsOffered) {
      setReason("ALL");
    }
  }, [reasonIsOffered]);

  useEffect(() => {
    const shown: StockMovementsFilters = { search, reason, period };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, reason, period, filters]);

  const days = periodDays(period);
  const data = useStockMovementsQuery({
    days,
    fetchStockMovements: services.fetchStockMovements,
    onSessionEnded,
  });
  const movements = data.status === "loaded" ? data.value.movements : NO_MOVEMENTS;

  const table = useTableModel({
    items: movements,
    id: (movement) => movement.id,
    search: { text: search, in: (movement) => [movement.productName] },
    filter: (movement) => reason === "ALL" || movement.reason === reason,
    columns,
  });
  const matchCount = table.getRowModel().rows.length;

  // A fresh id for each notice, so a screen reader announces a notice with the same text again.
  function showNotice(shown: Omit<ScreenNotice, "id">) {
    lastNoticeId.current += 1;
    setNotice({ ...shown, id: lastNoticeId.current });
  }

  function handleRegistered(product: StockProduct, result: StockMovementResult, delta: number) {
    setModalOpen(false);
    void refreshStock();
    showNotice(registeredNotice(product, result, delta, showsBalance));
  }

  return (
    <>
      <ScreenLayout
        topBar={
          <StockTopBar
            title="Ajustes y pérdidas"
            action={
              <Button
                variant="primary"
                icon={<Plus />}
                onPress={() => {
                  setNotice(null);
                  setModalOpen(true);
                }}
              >
                {actionLabel(kinds)}
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
              placeholder="Buscar un producto"
              icon={<Search />}
            />
          </div>
          <ListFilter
            label="Motivo:"
            options={reasonOptions}
            value={reasonIsOffered ? reason : "ALL"}
            onChange={setReason}
          />
          <ListFilter
            label="Período:"
            options={STOCK_PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
          />
        </div>
        <Table
          aria-label="Ajustes y pérdidas"
          table={table}
          {...cloudTableState(data, "los ajustes y las pérdidas")}
          empty={
            movements.length === 0
              ? {
                  icon: <ArrowDownUp />,
                  title: `Sin pérdidas ni ajustes en los últimos ${days} días`,
                  variant: "blank",
                }
              : {
                  icon: <Search />,
                  title: "Sin resultados",
                  description: "Probá con otro nombre o motivo.",
                  variant: "filtered",
                }
          }
          footer={
            matchCount === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {plural(matchCount, { one: "1 movimiento", other: `${matchCount} movimientos` })}
              </p>
            )
          }
        />
      </ScreenLayout>
      {modalOpen && firstKind ? (
        <StockMovementModal
          title={actionLabel(kinds)}
          kinds={[firstKind, ...kinds.slice(1)]}
          showsBalance={showsBalance}
          services={services}
          onClose={() => setModalOpen(false)}
          onSessionEnded={onSessionEnded}
          onRegistered={handleRegistered}
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
