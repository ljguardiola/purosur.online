import { type CashMovementsBody, cashMovementsSchema } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  plural,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { ArrowLeftRight } from "lucide-react";
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
import type { CashMovementsScreenServices } from "./cash-movements-services";
import { useCashMovementsQuery } from "./register-queries";

export type CashMovementsScreenProps = {
  filters: ReportFiltersValue;
  onFiltersChange: (filters: ReportFiltersValue) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: CashMovementsScreenServices;
};

type MovementRow = CashMovementsBody["movements"][number];

const NO_MOVEMENTS: MovementRow[] = [];

const movementShape = cashMovementsSchema.shape.movements.element.shape;
const OCCURRED_TIME_ZONE = schemaText(movementShape.occurred_at.meta()?.["timeZone"]);
const OPENED_TIME_ZONE = schemaText(movementShape.session_opened_at.meta()?.["timeZone"]);

const KIND_LABELS: Record<MovementRow["kind"], string> = {
  CASH_IN: "Ingreso",
  CASH_OUT: "Gasto",
  WITHDRAWAL: "Retiro",
};

const movementColumns = [
  dataColumn({
    id: "occurredAt",
    header: "Fecha",
    render: (movement: MovementRow) => {
      const { date, time } = reportMoment(movement.occurred_at, OCCURRED_TIME_ZONE);
      return <TableCellText description={time}>{date}</TableCellText>;
    },
  }),
  dataColumn({
    id: "kind",
    header: "Tipo",
    render: (movement: MovementRow) => KIND_LABELS[movement.kind],
  }),
  dataColumn({
    id: "reason",
    header: "Motivo",
    render: (movement: MovementRow) => movement.reason,
  }),
  dataColumn({
    id: "session",
    header: "Sesión",
    render: (movement: MovementRow) => {
      const { date, time } = reportMoment(movement.session_opened_at, OPENED_TIME_ZONE);
      return (
        <TableCellText description={`Apertura ${date} ${time}`}>
          {movement.register_name}
        </TableCellText>
      );
    },
  }),
  dataColumn({
    id: "amount",
    header: "Monto",
    align: "end",
    render: (movement: MovementRow) => formatCents(movement.amount),
  }),
] as const;

function countText(movements: number): string {
  return plural(movements, {
    one: "1 movimiento",
    other: `${formatNumber(movements)} movimientos`,
  });
}

type KindTotal = CashMovementsBody["totals"]["cash_in"];

const TOTAL_CARDS = [
  { label: "Ingresos", totalOf: (totals: CashMovementsBody["totals"]) => totals.cash_in },
  { label: "Gastos", totalOf: (totals: CashMovementsBody["totals"]) => totals.cash_out },
  { label: "Retiros", totalOf: (totals: CashMovementsBody["totals"]) => totals.withdrawal },
] satisfies { label: string; totalOf: (totals: CashMovementsBody["totals"]) => KindTotal }[];

export function CashMovementsScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: CashMovementsScreenProps) {
  const data = useCashMovementsQuery({
    query: reportQueryOf(filters),
    fetchCashMovements: services.fetchCashMovements,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.movements ?? NO_MOVEMENTS,
    id: (movement) => movement.id,
    columns: movementColumns,
  });
  const registerChosen = filters.register !== "ALL";

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Caja" title="Movimientos de caja" />}
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
          {TOTAL_CARDS.map(({ label, totalOf }) => (
            <Card key={label}>
              {shown ? (
                <FigureStat
                  size="heading"
                  label={label}
                  detail={countText(totalOf(shown.totals).movements)}
                  value={formatCents(totalOf(shown.totals).amount)}
                />
              ) : (
                <FigureStat size="heading" label={label} loading />
              )}
            </Card>
          ))}
        </div>
      )}
      <Table
        aria-label="Movimientos de caja"
        table={table}
        {...cloudTableState(data, "los movimientos de caja")}
        empty={{
          icon: <ArrowLeftRight />,
          title: registerChosen
            ? "No hay movimientos en esta caja en este período"
            : "No hay movimientos de caja en este período",
          variant: registerChosen ? "filtered" : "blank",
        }}
      />
    </ScreenLayout>
  );
}
