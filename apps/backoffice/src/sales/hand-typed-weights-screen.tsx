import type { HandTypedWeightsBody } from "@purosur/contracts";
import { handTypedWeightsSchema } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatNumber,
  LoadFailure,
  plural,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { Scale } from "lucide-react";
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
import type { HandTypedWeightsScreenServices } from "./hand-typed-weights-services";
import { useHandTypedWeightsQuery } from "./sales-queries";

export type HandTypedWeightsScreenProps = {
  filters: ReportFiltersValue;
  onFiltersChange: (filters: ReportFiltersValue) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: HandTypedWeightsScreenServices;
};

type CashierRow = HandTypedWeightsBody["cashiers"][number];
type SessionRow = HandTypedWeightsBody["sessions"][number];

const NO_CASHIERS: CashierRow[] = [];
const NO_SESSIONS: SessionRow[] = [];

const OPENED_TIME_ZONE = schemaText(
  handTypedWeightsSchema.shape.sessions.element.shape.opened_at.meta()?.["timeZone"],
);

const UNIDENTIFIED = "Sin identificar";
const NO_FIGURE = "—";

const cashierColumns = [
  dataColumn({
    id: "name",
    header: "Cajero",
    render: (row: CashierRow) => row.name ?? UNIDENTIFIED,
  }),
  dataColumn({
    id: "weighed",
    header: "Pesadas",
    align: "end",
    render: (row: CashierRow) => formatNumber(row.weighed_lines),
  }),
  dataColumn({
    id: "typed",
    header: "Tipeadas a mano",
    align: "end",
    render: (row: CashierRow) => (
      <TableCellText strong>{formatNumber(row.typed_lines)}</TableCellText>
    ),
  }),
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
  dataColumn({
    id: "weighed",
    header: "Pesadas",
    align: "end",
    render: (row: SessionRow) => formatNumber(row.weighed_lines),
  }),
  dataColumn({
    id: "typed",
    header: "Tipeadas a mano",
    align: "end",
    render: (row: SessionRow) => (
      <TableCellText strong>{formatNumber(row.typed_lines)}</TableCellText>
    ),
  }),
] as const;

export function HandTypedWeightsScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: HandTypedWeightsScreenProps) {
  const registerChosen = filters.register !== "ALL";
  const cashiersHeadingId = useId();
  const sessionsHeadingId = useId();
  const data = useHandTypedWeightsQuery({
    query: reportQueryOf(filters),
    fetchHandTypedWeights: services.fetchHandTypedWeights,
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
  const topCashier = shown?.cashiers[0];
  const empty = {
    icon: <Scale />,
    title: registerChosen
      ? "No hay productos pesados en esta caja en este período"
      : "No hay productos pesados en este período",
    variant: registerChosen ? "filtered" : "blank",
  } as const;

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Ventas" title="Pesos tipeados a mano" />}
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
        <LoadFailure {...cloudLoadFailure(data, "el reporte de pesos tipeados a mano")} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {shown ? (
              <>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Líneas pesadas"
                    value={formatNumber(shown.totals.weighed_lines)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Tipeadas a mano"
                    value={formatNumber(shown.totals.typed_lines)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Más tipeadas"
                    value={topCashier === undefined ? NO_FIGURE : (topCashier.name ?? UNIDENTIFIED)}
                    {...(topCashier === undefined
                      ? {}
                      : {
                          detail: plural(topCashier.typed_lines, {
                            one: "1 línea",
                            other: `${formatNumber(topCashier.typed_lines)} líneas`,
                          }),
                        })}
                  />
                </Card>
              </>
            ) : (
              <>
                <Card>
                  <FigureStat size="heading" label="Líneas pesadas" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Tipeadas a mano" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Más tipeadas" loading />
                </Card>
              </>
            )}
          </div>
          <section aria-labelledby={cashiersHeadingId} className="flex flex-col gap-3">
            <h2 id={cashiersHeadingId} className="text-subheading text-text">
              Por cajero
            </h2>
            <Table
              aria-label="Pesos tipeados a mano por cajero"
              table={cashiersTable}
              {...cloudTableState(data, "el reporte de pesos tipeados a mano")}
              empty={empty}
            />
          </section>
          <section aria-labelledby={sessionsHeadingId} className="flex flex-col gap-3">
            <h2 id={sessionsHeadingId} className="text-subheading text-text">
              Por sesión
            </h2>
            <Table
              aria-label="Pesos tipeados a mano por sesión"
              table={sessionsTable}
              {...cloudTableState(data, "el reporte de pesos tipeados a mano")}
              empty={empty}
            />
          </section>
        </>
      )}
    </ScreenLayout>
  );
}
