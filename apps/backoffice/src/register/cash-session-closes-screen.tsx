import { type CashSessionClosesBody, cashSessionClosesSchema } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  EmptyState,
  FigureStat,
  formatCents,
  formatNumber,
  formatSignedCents,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { Calculator } from "lucide-react";
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
import type { CashSessionClosesScreenServices } from "./cash-session-closes-services";
import { useCashSessionClosesQuery } from "./register-queries";

export type CashSessionClosesScreenProps = {
  filters: ReportFiltersValue;
  onFiltersChange: (filters: ReportFiltersValue) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: CashSessionClosesScreenServices;
};

type SessionRow = CashSessionClosesBody["sessions"][number];

const NO_SESSIONS: SessionRow[] = [];

const CLOSED_TIME_ZONE = schemaText(
  cashSessionClosesSchema.shape.sessions.element.shape.closed_at.meta()?.["timeZone"],
);

const UNIDENTIFIED = "Sin identificar";

function differenceCell(session: SessionRow) {
  if (!session.has_difference) {
    return <TableCellText strong>Sin diferencia</TableCellText>;
  }
  return (
    <TableCellText strong tone={session.difference < 0 ? "error" : "success"}>
      {formatSignedCents(session.difference)}
    </TableCellText>
  );
}

const sessionColumns = [
  dataColumn({
    id: "closedAt",
    header: "Fecha",
    render: (session: SessionRow) => {
      const { date, time } = reportMoment(session.closed_at, CLOSED_TIME_ZONE);
      return <TableCellText description={time}>{date}</TableCellText>;
    },
  }),
  dataColumn({
    id: "register",
    header: "Caja",
    render: (session: SessionRow) => session.register_name,
  }),
  dataColumn({
    id: "cashier",
    header: "Cajero",
    render: (session: SessionRow) => (
      <TableCellText
        description={
          session.closed_by_id === session.cashier_id
            ? undefined
            : `Cerró: ${session.closed_by_name ?? UNIDENTIFIED}`
        }
      >
        {session.cashier_name ?? UNIDENTIFIED}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "expected",
    header: "Esperado",
    align: "end",
    render: (session: SessionRow) => formatCents(session.expected_cash),
  }),
  dataColumn({
    id: "counted",
    header: "Contado",
    align: "end",
    render: (session: SessionRow) => formatCents(session.counted_cash),
  }),
  dataColumn({
    id: "difference",
    header: "Diferencia",
    align: "end",
    render: differenceCell,
  }),
] as const;

function cashiersWithDifferenceText(totals: CashSessionClosesBody["totals"]): string | undefined {
  return totals.cashiers.length === 0
    ? undefined
    : totals.cashiers
        .map((cashier) => `${cashier.cashier_name ?? UNIDENTIFIED} ${cashier.sessions}`)
        .join(" · ");
}

export function CashSessionClosesScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: CashSessionClosesScreenProps) {
  const data = useCashSessionClosesQuery({
    query: reportQueryOf(filters),
    fetchCashSessionCloses: services.fetchCashSessionCloses,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.sessions ?? NO_SESSIONS,
    id: (session) => session.id,
    columns: sessionColumns,
  });
  const noSessions = data.status === "loaded" && data.value.sessions.length === 0;

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Caja" title="Cierres de sesión" />}
      bodyClassName="gap-4 p-6"
    >
      <ReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        answeredPeriod={shown?.range}
        registerFilter={registerFilter}
      />
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-3 gap-4">
          {shown ? (
            <>
              <Card>
                <FigureStat
                  size="heading"
                  label="Sesiones cerradas"
                  value={formatNumber(shown.totals.sessions)}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Diferencia total"
                  value={formatSignedCents(shown.totals.net_difference)}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Con diferencia"
                  detail={cashiersWithDifferenceText(shown.totals)}
                  value={`${formatNumber(shown.totals.with_difference)} de ${formatNumber(shown.totals.sessions)}`}
                />
              </Card>
            </>
          ) : (
            <>
              <Card>
                <FigureStat size="heading" label="Sesiones cerradas" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Diferencia total" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Con diferencia" loading />
              </Card>
            </>
          )}
        </div>
      )}
      {noSessions ? (
        <EmptyState
          icon={<Calculator />}
          title="No hay sesiones cerradas en este período"
          variant={filters.register === "ALL" ? "blank" : "filtered"}
        />
      ) : (
        <Table
          aria-label="Cierres de sesión"
          table={table}
          {...cloudTableState(data, "los cierres de sesión")}
        />
      )}
    </ScreenLayout>
  );
}
