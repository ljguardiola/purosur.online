import type { EmptyStateProps, TableLoadingState } from "@purosur/ui";
import {
  dataColumn,
  formatCents,
  formatClockTime,
  formatDayMonthAndTime,
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
      render: (row: Row) => (
        <TableCellText strong>
          {withDate
            ? formatDayMonthAndTime(row.occurred_at).replace(" · ", " ")
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
      render: (row: Row) => paymentMethodsText(row.payment_methods),
    }),
    dataColumn({
      id: "total",
      header: "Total",
      align: "end",
      render: (row: Row) => <TableCellText strong>{formatCents(row.total)}</TableCellText>,
    }),
    dataColumn({
      id: "state",
      header: "Estado",
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
