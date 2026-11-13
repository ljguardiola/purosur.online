import type { EmptyStateProps, TableLoadingState } from "@purosur/ui";
import {
  dataColumn,
  formatCents,
  formatClockTime,
  formatDayMonthAndTimeInColumn,
  Table,
  TableCellText,
  Tag,
  useTableModel,
} from "@purosur/ui";
import { TriangleAlert } from "lucide-react";
import type { LegendItem } from "../platform/key-layer";
import type { CoreData } from "../platform/use-core-query";
import { comprobanteLine, paymentMethodsText, saleStatePresentation } from "./sale-history-text";
import type { ShownSalesHistory } from "./sales-queries";

type Row = Extract<ShownSalesHistory, { kind: "found" }>["rows"][number];

const CLOCK_TIME_WIDTH = 48;
const DATE_AND_TIME_WIDTH = 100;
const METHODS_WIDTH = 190;
const TOTAL_WIDTH = 120;
const STATE_WIDTH = 100;

function loadingOf(state: Exclude<CoreData<unknown>, { status: "failed" }>): TableLoadingState {
  if (state.status === "loading") {
    return "initial";
  }
  return state.refreshing ? "updating" : false;
}

export type SalesHistoryTableProps = {
  history: CoreData<ShownSalesHistory>;
  withDate: boolean;
  selectedSaleId: string | undefined;
  inactive: boolean;
  legend: readonly LegendItem[];
  empty: EmptyStateProps;
  onSelect: (saleId: string) => void;
};

export function SalesHistoryTable({
  history,
  withDate,
  selectedSaleId,
  inactive,
  legend,
  empty,
  onSelect,
}: SalesHistoryTableProps) {
  const rows =
    history.status === "loaded" && history.value.kind === "found" ? history.value.rows : [];
  const columns = [
    dataColumn({
      id: "time",
      header: "Hora",
      width: withDate ? DATE_AND_TIME_WIDTH : CLOCK_TIME_WIDTH,
      render: (row: Row) => (
        <TableCellText strong>
          {withDate
            ? formatDayMonthAndTimeInColumn(row.occurred_at)
            : formatClockTime(row.occurred_at)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "comprobante",
      header: "Comprobante",
      render: (row: Row) => comprobanteLine(row.comprobante),
    }),
    dataColumn({
      id: "methods",
      header: "Medios",
      width: METHODS_WIDTH,
      render: (row: Row) => paymentMethodsText(row.payment_methods),
    }),
    dataColumn({
      id: "total",
      header: "Total",
      align: "end",
      width: TOTAL_WIDTH,
      render: (row: Row) => <TableCellText strong>{formatCents(row.total)}</TableCellText>,
    }),
    dataColumn({
      id: "state",
      header: "Estado",
      width: STATE_WIDTH,
      render: (row: Row) => {
        const { label, tone } = saleStatePresentation(row.state);
        return <Tag tone={tone}>{label}</Tag>;
      },
    }),
  ] as const;
  const table = useTableModel({
    items: rows,
    id: (row) => row.sale_id,
    columns,
  });

  return (
    <Table
      aria-label="Ventas"
      table={table}
      fill
      emptyKeepsHeaders
      failureKeepsHeaders
      inactive={inactive}
      {...(legend.length === 0 ? {} : { legend })}
      rowState={(row) => (row.sale_id === selectedSaleId ? "selected" : undefined)}
      onRowPress={(row) => onSelect(row.sale_id)}
      {...(history.status === "failed"
        ? {
            failure: {
              variant: "centered" as const,
              icon: <TriangleAlert />,
              title: "No se pudieron leer las ventas",
              description: "Volvé a intentarlo en unos segundos.",
            },
          }
        : { loading: loadingOf(history) })}
      empty={empty}
    />
  );
}
