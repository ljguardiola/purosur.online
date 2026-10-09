import type { TableLoadingState } from "@purosur/ui";
import {
  actionsColumn,
  dataColumn,
  formatCents,
  formatClockTime,
  ListFilter,
  Pagination,
  plural,
  Table,
  TableCellText,
  Tag,
  useTableModel,
} from "@purosur/ui";
import { Eye, ReceiptText, TriangleAlert } from "lucide-react";
import type { CoreData } from "../platform/use-core-query";
import {
  comprobantePresentation,
  operationText,
  paymentMethodsText,
  saleStatePresentation,
} from "./sale-history-text";
import type { ShownSalesHistory } from "./sales-queries";

type Row = Extract<ShownSalesHistory, { kind: "found" }>["rows"][number];

export type SessionFilter = "open" | "all";
export type StateFilter = "all" | "completed" | "in_progress" | "deferred";

const SESSION_OPTIONS = [
  { value: "open", label: "La abierta" },
  { value: "all", label: "Todas" },
] as const;

const STATE_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "completed", label: "Completada" },
  { value: "in_progress", label: "En trámite" },
  { value: "deferred", label: "Diferida" },
] as const;

function loadingOf(state: Exclude<CoreData<unknown>, { status: "failed" }>): TableLoadingState {
  if (state.status === "loading") {
    return "initial";
  }
  return state.refreshing ? "updating" : false;
}

function pageRange(page: number, pageSize: number, total: number): string {
  const sales = plural(total, { one: "venta", other: "ventas" });
  if (total <= pageSize) {
    return `${total} ${sales}`;
  }
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return `${first} a ${last} de ${total} ${sales}`;
}

export type SalesHistoryTableProps = {
  history: CoreData<ShownSalesHistory>;
  session: SessionFilter;
  state: StateFilter;
  page: number;
  selectedSaleId: string | undefined;
  onSessionChange: (session: SessionFilter) => void;
  onStateChange: (state: StateFilter) => void;
  onPageChange: (page: number) => void;
  onSelect: (saleId: string) => void;
};

export function SalesHistoryTable({
  history,
  session,
  state,
  page,
  selectedSaleId,
  onSessionChange,
  onStateChange,
  onPageChange,
  onSelect,
}: SalesHistoryTableProps) {
  const found =
    history.status === "loaded" && history.value.kind === "found" ? history.value : undefined;
  const rows = found === undefined ? [] : found.rows;
  const columns = [
    dataColumn({
      id: "time",
      header: "Hora",
      render: (row: Row) => formatClockTime(row.occurred_at),
    }),
    dataColumn({
      id: "comprobante",
      header: "Comprobante",
      render: (row: Row) => {
        const comprobante = comprobantePresentation(row.comprobante);
        const operation =
          row.operation_number === null ? undefined : operationText(row.operation_number);
        return comprobante === undefined ? (
          <TableCellText>{operation ?? "—"}</TableCellText>
        ) : (
          <TableCellText
            description={
              <>
                <span className="block">{comprobante.detail}</span>
                {operation === undefined ? null : <span className="block">{operation}</span>}
              </>
            }
          >
            {comprobante.name}
          </TableCellText>
        );
      },
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
      render: (row: Row) => formatCents(row.total),
    }),
    dataColumn({
      id: "state",
      header: "Estado",
      render: (row: Row) => {
        const { label, tone } = saleStatePresentation(row.state);
        return <Tag tone={tone}>{label}</Tag>;
      },
    }),
    actionsColumn({
      id: "detail",
      header: "Detalle",
      actions: [
        (row: Row) => ({
          icon: <Eye />,
          "aria-label": `Ver la venta de las ${formatClockTime(row.occurred_at)}`,
          onPress: () => onSelect(row.sale_id),
        }),
      ],
    }),
  ] as const;
  const table = useTableModel({
    items: rows,
    id: (row) => row.sale_id,
    columns,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ListFilter
          name="session"
          label="Sesión:"
          options={SESSION_OPTIONS}
          value={session}
          onChange={onSessionChange}
        />
        <ListFilter
          name="state"
          label="Estado:"
          options={STATE_OPTIONS}
          value={state}
          onChange={onStateChange}
        />
      </div>
      <Table
        aria-label="Ventas"
        table={table}
        rowState={(row) => (row.sale_id === selectedSaleId ? "selected" : undefined)}
        {...(history.status === "failed"
          ? {
              failure: {
                icon: <TriangleAlert />,
                title: "No se pudieron leer las ventas",
                description: "Volvé a intentarlo en unos segundos.",
                onRetry: history.retry,
              },
            }
          : { loading: loadingOf(history) })}
        empty={
          state === "all"
            ? { icon: <ReceiptText />, title: "Todavía no hay ventas", variant: "blank" }
            : { icon: <ReceiptText />, title: "No hay ventas en ese estado", variant: "filtered" }
        }
        footer={
          found === undefined || found.rows.length === 0 ? undefined : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-text-subtle text-detail">
                {pageRange(page, found.page_size, found.total)}
              </p>
              <Pagination
                page={page}
                pageCount={Math.ceil(found.total / found.page_size)}
                onPageChange={onPageChange}
                label="Páginas de ventas"
              />
            </div>
          )
        }
      />
    </div>
  );
}
