import type { StockCountList, StockMovementList } from "@purosur/contracts";
import {
  dataColumn,
  formatNumber,
  ListFilter,
  plural,
  SearchField,
  Table,
  TableCellText,
  Tag,
  Toggle,
  ToggleChipGroup,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { deepEqual } from "@tanstack/react-router";
import { ArrowDownUp, Search } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { combineCloudData } from "../platform/combine-cloud-data";
import { formatStockChange, formatStockQuantity } from "../platform/stock-quantity";
import type { CloudData } from "../platform/use-cloud-query";
import {
  type BackofficeAccess,
  canPerformStockCounts,
  canSeeLossesByReason,
} from "../shell/backoffice-access";
import { LossesByReasonReportContent } from "./losses-by-reason-report-content";
import type { StockMovementsSearchFilters } from "./routes";
import { REASONS_OF_KIND } from "./stock-movement-form";
import type { StockRecordsServices } from "./stock-movements-services";
import {
  formatStockDay,
  formatStockTime,
  periodDays,
  STOCK_PERIOD_OPTIONS,
  type StockPeriod,
} from "./stock-period";
import { useStockCountsQuery, useStockMovementsQuery } from "./stock-queries";
import { REASON_LABELS } from "./stock-reason-labels";
import { type StockRecord, type StockRecordKind, stockRecords } from "./stock-records";

export type StockMovementsScreenProps = {
  access: BackofficeAccess;
  filters: StockMovementsSearchFilters;
  onFiltersChange: (filters: StockMovementsSearchFilters) => void;
  onSessionEnded: () => void;
  services: StockRecordsServices;
};

type ReasonFilter = StockMovementsSearchFilters["reason"];

const NO_RECORDS: StockRecord[] = [];

const KIND_LABELS = {
  count: "Recuento",
  adjustment: "Ajuste",
  loss: "Pérdida",
} satisfies Record<StockRecordKind, string>;

const RECORD_KINDS: readonly StockRecordKind[] = ["count", "adjustment", "loss"];

const NO_COUNTS_READ: CloudData<StockCountList> = {
  status: "loaded",
  value: { counts: [] },
  refreshing: false,
};

const NO_MOVEMENTS_READ: CloudData<StockMovementList> = {
  status: "loaded",
  value: { movements: [] },
  refreshing: false,
};

function recordsOf(data: CloudData<[StockCountList, StockMovementList]>): CloudData<StockRecord[]> {
  if (data.status === "loaded") {
    const [{ counts }, { movements }] = data.value;
    return {
      status: "loaded",
      value: stockRecords(counts, movements),
      refreshing: data.refreshing,
    };
  }
  if (data.status === "failed") {
    const { lastValue: _lastValue, ...failure } = data;
    return failure;
  }
  return { status: "loading" };
}

function recordProduct(record: StockRecord): string {
  return formatProductDescription({
    name: record.productName,
    brandName: record.brandName,
    netContent: record.netContent,
  });
}

function recordDetail(record: StockRecord): string {
  const { detail } = record;
  return detail.kind === "movement"
    ? REASON_LABELS[detail.reason]
    : `Esperado ${formatStockQuantity(detail.expected, record.saleUnit)} · contado ${formatStockQuantity(detail.counted, record.saleUnit)}`;
}

function recordQuantity(record: StockRecord) {
  const change =
    record.kind === "count" && record.delta === 0
      ? "Sin diferencia"
      : formatStockChange(record.delta, record.saleUnit);
  return record.superseded ? (
    <div className="flex flex-col items-end gap-1">
      <span>{change}</span>
      <Tag tone="neutral">Superado por un recuento posterior</Tag>
    </div>
  ) : (
    change
  );
}

const columns = [
  dataColumn({
    id: "date",
    header: "Fecha",
    render: (record: StockRecord) => (
      <TableCellText description={formatStockTime(record.occurredAt)}>
        {formatStockDay(record.occurredAt)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "product",
    header: "Producto",
    render: (record: StockRecord) => (
      <TableCellText description={record.categoryName}>{recordProduct(record)}</TableCellText>
    ),
  }),
  dataColumn({
    id: "kind",
    header: "Tipo",
    render: (record: StockRecord) => (
      <Tag tone={record.kind === "adjustment" ? "info" : "neutral"}>{KIND_LABELS[record.kind]}</Tag>
    ),
  }),
  dataColumn({
    id: "detail",
    header: "Motivo",
    render: recordDetail,
  }),
  dataColumn({
    id: "quantity",
    header: "Cantidad",
    align: "end",
    render: recordQuantity,
  }),
] as const;

export function StockMovementsScreen({
  access,
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: StockMovementsScreenProps) {
  const mayCount = canPerformStockCounts(access);
  const manualKinds = access.stockMovementKinds;
  const mayReadMovements = manualKinds.length > 0;
  const offeredKinds = RECORD_KINDS.filter((kind) =>
    kind === "count" ? mayCount : manualKinds.includes(kind),
  );
  const [firstChip, ...otherChips] = offeredKinds.map((kind) => ({
    value: kind,
    label: KIND_LABELS[kind],
  }));

  const [search, setSearch] = useState(filters.search);
  const [reason, setReason] = useState<ReasonFilter>(filters.reason);
  const [period, setPeriod] = useState<StockPeriod>(filters.period);
  const [types, setTypes] = useState(() =>
    filters.type.filter((kind) => offeredKinds.includes(kind)),
  );
  const [view, setView] = useState(filters.view);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const reportFilters = useEffectEvent(onFiltersChange);

  const mayGroup = canSeeLossesByReason(access) && types.length === 1 && types[0] === "loss";
  const grouped = mayGroup && view === "reason";

  const reasonOptions: [
    { value: ReasonFilter; label: string },
    ...{ value: ReasonFilter; label: string }[],
  ] = [
    { value: "ALL", label: "Todos" },
    ...manualKinds
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
    const shown: StockMovementsSearchFilters = {
      search,
      reason,
      period,
      type: types,
      view,
      from,
      to,
    };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, reason, period, types, view, from, to, filters]);

  const days = periodDays(period);
  const countsData = useStockCountsQuery({
    days,
    fetchStockCounts: services.fetchStockCounts,
    onSessionEnded,
    enabled: mayCount && !grouped,
  });
  const movementsData = useStockMovementsQuery({
    days,
    fetchStockMovements: services.fetchStockMovements,
    onSessionEnded,
    enabled: mayReadMovements && !grouped,
  });
  const data = recordsOf(
    combineCloudData(
      mayCount ? countsData : NO_COUNTS_READ,
      mayReadMovements ? movementsData : NO_MOVEMENTS_READ,
    ),
  );
  const records = data.status === "loaded" ? data.value : NO_RECORDS;

  const table = useTableModel({
    items: records,
    id: (record) => record.id,
    search: { text: search, in: (record) => [recordProduct(record)] },
    filter: (record) =>
      (types.length === 0 || types.includes(record.kind)) &&
      (reason === "ALL" || (record.detail.kind === "movement" && record.detail.reason === reason)),
    columns,
  });
  const matchCount = table.getRowModel().rows.length;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
      <div className="flex flex-wrap items-end gap-3">
        {firstChip === undefined ? null : (
          <div className="w-96">
            <ToggleChipGroup
              label="Tipo"
              options={[firstChip, ...otherChips]}
              value={types}
              onChange={setTypes}
            />
          </div>
        )}
        {grouped ? null : (
          <>
            <div className="w-105">
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Buscar un producto"
                icon={<Search />}
              />
            </div>
            {mayReadMovements ? (
              <ListFilter
                name="reason"
                label="Motivo:"
                options={reasonOptions}
                value={reasonIsOffered ? reason : "ALL"}
                onChange={setReason}
              />
            ) : null}
            <ListFilter
              name="period"
              label="Período:"
              options={STOCK_PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
            />
          </>
        )}
        {mayGroup ? (
          <Toggle
            name="view"
            checked={grouped}
            onCheckedChange={(checked) => setView(checked ? "reason" : "list")}
          >
            Agrupar por motivo
          </Toggle>
        ) : null}
      </div>
      {grouped ? (
        <LossesByReasonReportContent
          filters={{ from, to }}
          onFiltersChange={(range) => {
            setFrom(range.from);
            setTo(range.to);
          }}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      ) : (
        <Table
          aria-label="Movimientos"
          table={table}
          {...cloudTableState(data, "los movimientos")}
          empty={
            records.length === 0
              ? {
                  icon: <ArrowDownUp />,
                  title: `Sin movimientos en los últimos ${days} días`,
                  variant: "blank",
                }
              : {
                  icon: <Search />,
                  title: "Sin resultados",
                  description: "Probá con otro nombre, tipo o motivo.",
                  variant: "filtered",
                }
          }
          footer={
            matchCount === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {plural(matchCount, {
                  one: "1 movimiento",
                  other: `${formatNumber(matchCount)} movimientos`,
                })}
              </p>
            )
          }
        />
      )}
    </div>
  );
}
