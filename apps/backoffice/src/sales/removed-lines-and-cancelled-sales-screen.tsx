import type { RemovedLinesAndCancelledSalesBody } from "@purosur/contracts";
import { removedLinesAndCancelledSalesSchema } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  EmptyState,
  FigureStat,
  formatCents,
  formatNumber,
  LoadFailure,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { Ban } from "lucide-react";
import { useId } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { cloudTableState } from "../platform/cloud-table-state";
import { reportMoment } from "../platform/report-moment";
import { schemaText } from "../platform/schema-text";
import { ReportFilters } from "../shell/report-filters";
import {
  type ReportFilters as ReportFiltersValue,
  reportQueryOf,
} from "../shell/report-filters-search";
import type { ReportRegisterField } from "../shell/report-register-field";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { RemovedLinesAndCancelledSalesScreenServices } from "./removed-lines-and-cancelled-sales-services";
import { useRemovedLinesAndCancelledSalesQuery } from "./sales-queries";
import { soldQuantityText } from "./sold-quantity-text";

export type RemovedLinesAndCancelledSalesScreenProps = {
  filters: ReportFiltersValue;
  onFiltersChange: (filters: ReportFiltersValue) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: RemovedLinesAndCancelledSalesScreenServices;
};

type CashierRow = RemovedLinesAndCancelledSalesBody["cashiers"][number];
type SessionRow = RemovedLinesAndCancelledSalesBody["sessions"][number];
type FigureRow = Pick<CashierRow, "removed" | "cancelled">;

const NO_CASHIERS: CashierRow[] = [];
const NO_SESSIONS: SessionRow[] = [];

const OPENED_TIME_ZONE = schemaText(
  removedLinesAndCancelledSalesSchema.shape.sessions.element.shape.opened_at.meta()?.["timeZone"],
);

const UNIDENTIFIED = "Sin identificar";
const REPORT_NAME = "el reporte de líneas quitadas y ventas canceladas";

const figureColumns = [
  dataColumn({
    id: "removed-lines",
    header: "Líneas quitadas",
    align: "end",
    render: (row: FigureRow) => formatNumber(row.removed.lines),
  }),
  dataColumn({
    id: "removed-quantity",
    header: "Cantidad quitada",
    align: "end",
    render: (row: FigureRow) => soldQuantityText(row.removed),
  }),
  dataColumn({
    id: "removed-amount",
    header: "Importe quitado",
    align: "end",
    render: (row: FigureRow) => (
      <TableCellText strong>{formatCents(row.removed.amount)}</TableCellText>
    ),
  }),
  dataColumn({
    id: "cancelled-sales",
    header: "Ventas canceladas",
    align: "end",
    render: (row: FigureRow) => formatNumber(row.cancelled.sales),
  }),
  dataColumn({
    id: "cancelled-quantity",
    header: "Cantidad cancelada",
    align: "end",
    render: (row: FigureRow) => soldQuantityText(row.cancelled),
  }),
  dataColumn({
    id: "cancelled-amount",
    header: "Importe cancelado",
    align: "end",
    render: (row: FigureRow) => (
      <TableCellText strong>{formatCents(row.cancelled.amount)}</TableCellText>
    ),
  }),
] as const;

const cashierColumns = [
  dataColumn({
    id: "name",
    header: "Cajero",
    render: (row: CashierRow) => row.name ?? UNIDENTIFIED,
  }),
  ...figureColumns,
] as const;

const sessionColumns = [
  dataColumn({
    id: "register",
    header: "Caja",
    render: (row: SessionRow) => row.register_name,
  }),
  dataColumn({
    id: "opened",
    header: "Apertura",
    render: (row: SessionRow) => {
      const { date, time } = reportMoment(row.opened_at, OPENED_TIME_ZONE);
      return <TableCellText description={time}>{date}</TableCellText>;
    },
  }),
  ...figureColumns,
] as const;

export function RemovedLinesAndCancelledSalesScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: RemovedLinesAndCancelledSalesScreenProps) {
  const registerChosen = filters.register !== "ALL";
  const cashiersHeadingId = useId();
  const sessionsHeadingId = useId();
  const data = useRemovedLinesAndCancelledSalesQuery({
    query: reportQueryOf(filters),
    fetchRemovedLinesAndCancelledSales: services.fetchRemovedLinesAndCancelledSales,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const cashiersTable = useTableModel({
    items: shown?.cashiers ?? NO_CASHIERS,
    id: (row) => row.cashier_id,
    columns: cashierColumns,
  });
  const sessionsTable = useTableModel({
    items: shown?.sessions ?? NO_SESSIONS,
    id: (row) => row.session_id,
    columns: sessionColumns,
  });
  const nothingToReport =
    data.status === "loaded" &&
    cashiersTable.getRowModel().rows.length === 0 &&
    sessionsTable.getRowModel().rows.length === 0;

  return (
    <ScreenLayout
      topBar={
        <ScreenTopBar eyebrow="Reportes · Ventas" title="Líneas quitadas y ventas canceladas" />
      }
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          answeredPeriod={shown?.range}
          registerFilter={registerFilter}
        />
      </div>
      {data.status === "failed" ? (
        <LoadFailure {...cloudLoadFailure(data, REPORT_NAME)} />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            {shown ? (
              <>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Líneas quitadas"
                    value={formatNumber(shown.totals.removed.lines)}
                    detail={soldQuantityText(shown.totals.removed)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Importe quitado"
                    value={formatCents(shown.totals.removed.amount)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Ventas canceladas"
                    value={formatNumber(shown.totals.cancelled.sales)}
                    detail={soldQuantityText(shown.totals.cancelled)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Importe cancelado"
                    value={formatCents(shown.totals.cancelled.amount)}
                  />
                </Card>
              </>
            ) : (
              <>
                <Card>
                  <FigureStat size="heading" label="Líneas quitadas" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Importe quitado" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Ventas canceladas" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Importe cancelado" loading />
                </Card>
              </>
            )}
          </div>
          {nothingToReport ? (
            <EmptyState
              icon={<Ban />}
              title={
                registerChosen
                  ? "No hay líneas quitadas ni ventas canceladas en esta caja en este período"
                  : "No hay líneas quitadas ni ventas canceladas en este período"
              }
              variant={registerChosen ? "filtered" : "blank"}
            />
          ) : (
            <>
              <section aria-labelledby={cashiersHeadingId} className="flex flex-col gap-3">
                <h2 id={cashiersHeadingId} className="text-subheading text-text">
                  Por cajero
                </h2>
                <Table
                  aria-label="Líneas quitadas y ventas canceladas por cajero"
                  table={cashiersTable}
                  {...cloudTableState(data, REPORT_NAME)}
                />
              </section>
              <section aria-labelledby={sessionsHeadingId} className="flex flex-col gap-3">
                <h2 id={sessionsHeadingId} className="text-subheading text-text">
                  Por sesión
                </h2>
                <Table
                  aria-label="Líneas quitadas y ventas canceladas por sesión"
                  table={sessionsTable}
                  {...cloudTableState(data, REPORT_NAME)}
                />
              </section>
            </>
          )}
        </>
      )}
    </ScreenLayout>
  );
}
