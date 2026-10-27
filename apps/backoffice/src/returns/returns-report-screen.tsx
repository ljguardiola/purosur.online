import { type ReturnsReportBody, returnsReportSchema } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  LoadFailure,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { Undo2 } from "lucide-react";
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
import { useReturnsReportQuery } from "./returns-queries";
import type { ReturnsReportScreenServices } from "./returns-report-services";
import { returnedQuantityText, returnLineDetail, returnSaleText } from "./returns-text";

export type ReturnsReportScreenProps = {
  filters: ReportFiltersValue;
  onFiltersChange: (filters: ReportFiltersValue) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: ReturnsReportScreenServices;
};

type ReturnRow = ReturnsReportBody["typed"]["rows"][number];

const NO_ROWS: ReturnRow[] = [];

const OCCURRED_TIME_ZONE = schemaText(
  returnsReportSchema.shape.typed.shape.rows.element.shape.occurred_at.meta()?.["timeZone"],
);

const UNIDENTIFIED = "Sin identificar";
const NO_FIGURE = "—";

const returnColumns = [
  dataColumn({
    id: "moment",
    header: "Fecha",
    render: (row: ReturnRow) => {
      const { date, time } = reportMoment(row.occurred_at, OCCURRED_TIME_ZONE);
      return <TableCellText description={time}>{date}</TableCellText>;
    },
  }),
  dataColumn({
    id: "register",
    header: "Caja",
    render: (row: ReturnRow) => row.register.name,
  }),
  dataColumn({
    id: "sale",
    header: "Venta",
    render: (row: ReturnRow) => {
      const { operation, invoice } = returnSaleText(row.sale);
      return <TableCellText description={invoice}>{operation ?? NO_FIGURE}</TableCellText>;
    },
  }),
  dataColumn({
    id: "cashier",
    header: "Cajero",
    render: (row: ReturnRow) => row.cashier.name ?? UNIDENTIFIED,
  }),
  dataColumn({
    id: "authorizer",
    header: "Autorizó",
    render: (row: ReturnRow) =>
      row.authorizer === null ? NO_FIGURE : (row.authorizer.name ?? UNIDENTIFIED),
  }),
  dataColumn({
    id: "lines",
    header: "Líneas devueltas",
    render: (row: ReturnRow) => (
      <div className="flex flex-col gap-2">
        {row.lines.map((line) => (
          <TableCellText key={line.sale_line_id} description={returnLineDetail(line)}>
            {`${line.product_name} × ${returnedQuantityText(line.sale_unit, line.quantity)}`}
          </TableCellText>
        ))}
      </div>
    ),
  }),
  dataColumn({
    id: "refunded",
    header: "Reintegrado",
    align: "end",
    render: (row: ReturnRow) => <TableCellText strong>{formatCents(row.refunded)}</TableCellText>,
  }),
] as const;

export function ReturnsReportScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: ReturnsReportScreenProps) {
  const typedHeadingId = useId();
  const scannedHeadingId = useId();
  const filtered = filters.register !== "ALL";
  const data = useReturnsReportQuery({
    query: reportQueryOf(filters),
    fetchReturnsReport: services.fetchReturnsReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const typedTable = useTableModel({
    items: shown?.typed.rows ?? NO_ROWS,
    id: (row) => row.return_id,
    columns: returnColumns,
  });
  const scannedTable = useTableModel({
    items: shown?.scanned.rows ?? NO_ROWS,
    id: (row) => row.return_id,
    columns: returnColumns,
  });

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Caja" title="Devoluciones" />}
      bodyClassName="gap-4 p-6"
    >
      <ReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        answeredPeriod={shown?.range}
        registerFilter={registerFilter}
      />
      {data.status === "failed" ? (
        <LoadFailure {...cloudLoadFailure(data, "el reporte de devoluciones")} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {shown ? (
              <>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Devoluciones"
                    value={formatNumber(shown.typed.totals.returns + shown.scanned.totals.returns)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Reintegrado"
                    value={formatCents(shown.typed.totals.refunded + shown.scanned.totals.refunded)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Iniciadas a mano"
                    value={formatNumber(shown.typed.totals.returns)}
                  />
                </Card>
              </>
            ) : (
              <>
                <Card>
                  <FigureStat size="heading" label="Devoluciones" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Reintegrado" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Iniciadas a mano" loading />
                </Card>
              </>
            )}
          </div>
          <section aria-labelledby={typedHeadingId} className="flex flex-col gap-3">
            <h2 id={typedHeadingId} className="text-subheading text-text">
              Iniciadas con el número tipeado
            </h2>
            <Table
              aria-label="Devoluciones iniciadas con el número tipeado"
              table={typedTable}
              {...cloudTableState(data, "el reporte de devoluciones")}
              empty={{
                icon: <Undo2 />,
                title: filtered
                  ? "Ninguna devolución iniciada con el número tipeado coincide con estos filtros"
                  : "No hay devoluciones iniciadas con el número tipeado en este período",
                variant: filtered ? "filtered" : "blank",
              }}
            />
          </section>
          <section aria-labelledby={scannedHeadingId} className="flex flex-col gap-3">
            <h2 id={scannedHeadingId} className="text-subheading text-text">
              Iniciadas escaneando el QR
            </h2>
            <Table
              aria-label="Devoluciones iniciadas escaneando el QR"
              table={scannedTable}
              {...cloudTableState(data, "el reporte de devoluciones")}
              empty={{
                icon: <Undo2 />,
                title: filtered
                  ? "Ninguna devolución iniciada escaneando el QR coincide con estos filtros"
                  : "No hay devoluciones iniciadas escaneando el QR en este período",
                variant: filtered ? "filtered" : "blank",
              }}
            />
          </section>
        </>
      )}
    </ScreenLayout>
  );
}
