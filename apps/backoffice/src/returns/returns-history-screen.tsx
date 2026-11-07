import type { ReturnsReportBody } from "@purosur/contracts";
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
import { Ban, Undo2 } from "lucide-react";
import { useId, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { cloudTableState } from "../platform/cloud-table-state";
import { reportMoment } from "../platform/report-moment";
import { saleUnitQuantityText } from "../platform/sale-unit-quantity";
import { RegisterReportDownload } from "../shell/report-download";
import { reportFileName } from "../shell/report-file-name";
import { ReportFilters } from "../shell/report-filters";
import {
  type ReportFilters as ReportFiltersValue,
  reportQueryOf,
} from "../shell/report-filters-search";
import type { ReportRegisterField } from "../shell/report-register-field";
import type { ReturnsHistoryScreenServices } from "./returns-history-services";
import {
  authorizerSummaryRows,
  cashierSummaryRows,
  type PersonSummaryRow,
} from "./returns-person-summary";
import { useReturnsReportQuery } from "./returns-queries";
import { OCCURRED_TIME_ZONE } from "./returns-report-occurred-time-zone";
import { returnsReportSpreadsheet } from "./returns-report-spreadsheet";
import { returnLineDetail, returnSaleText, UNIDENTIFIED } from "./returns-text";

export type ReturnsHistoryScreenProps = {
  filters: ReportFiltersValue;
  onFiltersChange: (filters: ReportFiltersValue) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: ReturnsHistoryScreenServices;
};

type ReturnRow = ReturnsReportBody["typed"]["rows"][number];
type VoidRow = ReturnsReportBody["voids"]["rows"][number];

const NO_ROWS: ReturnRow[] = [];
const NO_VOIDS: VoidRow[] = [];
const NO_PEOPLE: PersonSummaryRow[] = [];

const SCREEN_TITLE = "Anulaciones y devoluciones";
const REPORT_NAME = "el reporte de anulaciones y devoluciones";

const NO_FIGURE = "—";
const NO_RETURNS = "No hay devoluciones en este período";
const NO_REGISTER_RETURNS = "No hay devoluciones de esta caja en este período";
const NO_VOIDS_TEXT = "No hay anulaciones en este período";
const NO_REGISTER_VOIDS = "No hay anulaciones de esta caja en este período";
const NO_ACTIVITY = "No hay anulaciones ni devoluciones en este período";
const NO_REGISTER_ACTIVITY = "No hay anulaciones ni devoluciones de esta caja en este período";

function personColumns(header: string) {
  return [
    dataColumn({
      id: "person",
      header,
      render: (row: PersonSummaryRow) => row.label,
    }),
    dataColumn({
      id: "voids",
      header: "Anulaciones",
      align: "end",
      render: (row: PersonSummaryRow) => formatNumber(row.voids),
    }),
    dataColumn({
      id: "voided",
      header: "Anulado",
      align: "end",
      render: (row: PersonSummaryRow) => (
        <TableCellText strong>{formatCents(row.voided)}</TableCellText>
      ),
    }),
    dataColumn({
      id: "returns",
      header: "Devoluciones",
      align: "end",
      render: (row: PersonSummaryRow) => formatNumber(row.returns),
    }),
    dataColumn({
      id: "refunded",
      header: "Reintegrado",
      align: "end",
      render: (row: PersonSummaryRow) => (
        <TableCellText strong>{formatCents(row.refunded)}</TableCellText>
      ),
    }),
    dataColumn({
      id: "refunded-lines",
      header: "Líneas reintegradas",
      align: "end",
      render: (row: PersonSummaryRow) => formatNumber(row.refunded_lines),
    }),
    dataColumn({
      id: "exchanged-lines",
      header: "Líneas cambiadas",
      align: "end",
      render: (row: PersonSummaryRow) => formatNumber(row.exchanged_lines),
    }),
    dataColumn({
      id: "typed-returns",
      header: "Iniciadas a mano",
      align: "end",
      render: (row: PersonSummaryRow) => formatNumber(row.typed_returns),
    }),
  ] as const;
}

const cashierColumns = personColumns("Cajero");
const authorizerColumns = personColumns("Autorizó");

const voidColumns = [
  dataColumn({
    id: "moment",
    header: "Fecha",
    render: (row: VoidRow) => {
      const { date, time } = reportMoment(row.voided_at, OCCURRED_TIME_ZONE);
      return <TableCellText description={time}>{date}</TableCellText>;
    },
  }),
  dataColumn({
    id: "register",
    header: "Caja",
    render: (row: VoidRow) => row.register.name,
  }),
  dataColumn({
    id: "sale",
    header: "Venta",
    render: (row: VoidRow) => {
      const { operation, invoice } = returnSaleText(row.sale);
      return <TableCellText description={invoice}>{operation ?? NO_FIGURE}</TableCellText>;
    },
  }),
  dataColumn({
    id: "cashier",
    header: "Cajero",
    render: (row: VoidRow) => row.cashier.name ?? UNIDENTIFIED,
  }),
  dataColumn({
    id: "authorizer",
    header: "Autorizó",
    render: (row: VoidRow) =>
      row.authorizer === null ? NO_FIGURE : (row.authorizer.name ?? UNIDENTIFIED),
  }),
  dataColumn({
    id: "total",
    header: "Total",
    align: "end",
    render: (row: VoidRow) => <TableCellText strong>{formatCents(row.total)}</TableCellText>,
  }),
] as const;

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
            {`${line.product_name} × ${saleUnitQuantityText(line.sale_unit, line.quantity)}`}
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

export function ReturnsHistoryScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: ReturnsHistoryScreenProps) {
  const [registerLabel, setRegisterLabel] = useState<string>();
  const cashiersHeadingId = useId();
  const authorizersHeadingId = useId();
  const voidsHeadingId = useId();
  const typedHeadingId = useId();
  const scannedHeadingId = useId();
  const filtered = filters.register !== "ALL";
  const data = useReturnsReportQuery({
    query: reportQueryOf(filters),
    fetchReturnsReport: services.fetchReturnsReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const cashiersTable = useTableModel({
    items: shown ? cashierSummaryRows(shown) : NO_PEOPLE,
    id: (row) => row.id,
    columns: cashierColumns,
  });
  const authorizersTable = useTableModel({
    items: shown ? authorizerSummaryRows(shown) : NO_PEOPLE,
    id: (row) => row.id,
    columns: authorizerColumns,
  });
  const voidsTable = useTableModel({
    items: shown?.voids.rows ?? NO_VOIDS,
    id: (row) => row.sale.id,
    columns: voidColumns,
  });
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

  const noReturns =
    data.status === "loaded" &&
    typedTable.getRowModel().rows.length === 0 &&
    scannedTable.getRowModel().rows.length === 0;
  const nothingToReport = noReturns && voidsTable.getRowModel().rows.length === 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
      <ReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        answeredPeriod={shown?.range}
        registerFilter={registerFilter}
        onRegisterLabelChange={setRegisterLabel}
        trailing={
          <RegisterReportDownload
            dataStatus={data.status}
            registerLabel={registerLabel}
            workbook={(registerLabel) =>
              shown ? returnsReportSpreadsheet(shown, registerLabel) : null
            }
            fileName={shown ? reportFileName(SCREEN_TITLE, shown.range) : ""}
          />
        }
      />
      {data.status === "failed" ? (
        <LoadFailure {...cloudLoadFailure(data, REPORT_NAME)} />
      ) : (
        <>
          <div className="grid grid-cols-5 gap-4">
            {shown ? (
              <>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Anulaciones"
                    value={formatNumber(shown.totals.voids)}
                    detail={formatCents(shown.totals.voided)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Devoluciones"
                    value={formatNumber(shown.totals.returns)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Reintegrado"
                    value={formatCents(shown.totals.refunded)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Cambios"
                    value={formatNumber(shown.totals.exchanged_lines)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Iniciadas a mano"
                    value={formatNumber(shown.totals.typed_returns)}
                  />
                </Card>
              </>
            ) : (
              <>
                <Card>
                  <FigureStat size="heading" label="Anulaciones" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Devoluciones" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Reintegrado" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Cambios" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Iniciadas a mano" loading />
                </Card>
              </>
            )}
          </div>
          {nothingToReport ? (
            <EmptyState
              icon={<Ban />}
              title={filtered ? NO_REGISTER_ACTIVITY : NO_ACTIVITY}
              variant={filtered ? "filtered" : "blank"}
            />
          ) : (
            <>
              <section aria-labelledby={cashiersHeadingId} className="flex flex-col gap-3">
                <h2 id={cashiersHeadingId} className="text-subheading text-text">
                  Por cajero
                </h2>
                <Table
                  aria-label="Anulaciones y devoluciones por cajero"
                  table={cashiersTable}
                  {...cloudTableState(data, REPORT_NAME)}
                />
              </section>
              <section aria-labelledby={authorizersHeadingId} className="flex flex-col gap-3">
                <h2 id={authorizersHeadingId} className="text-subheading text-text">
                  Por quién autorizó
                </h2>
                <Table
                  aria-label="Anulaciones y devoluciones por quién autorizó"
                  table={authorizersTable}
                  {...cloudTableState(data, REPORT_NAME)}
                />
              </section>
              <section aria-labelledby={voidsHeadingId} className="flex flex-col gap-3">
                <h2 id={voidsHeadingId} className="text-subheading text-text">
                  Anulaciones
                </h2>
                <Table
                  aria-label="Anulaciones"
                  table={voidsTable}
                  {...cloudTableState(data, REPORT_NAME)}
                  empty={{
                    icon: <Ban />,
                    title: filtered ? NO_REGISTER_VOIDS : NO_VOIDS_TEXT,
                    variant: filtered ? "filtered" : "blank",
                  }}
                />
              </section>
              {noReturns ? (
                <EmptyState
                  icon={<Undo2 />}
                  title={filtered ? NO_REGISTER_RETURNS : NO_RETURNS}
                  variant={filtered ? "filtered" : "blank"}
                />
              ) : (
                <>
                  <section aria-labelledby={typedHeadingId} className="flex flex-col gap-3">
                    <h2 id={typedHeadingId} className="text-subheading text-text">
                      Iniciadas con el número tipeado
                    </h2>
                    <Table
                      aria-label="Devoluciones iniciadas con el número tipeado"
                      table={typedTable}
                      {...cloudTableState(data, REPORT_NAME)}
                      empty={{
                        icon: <Undo2 />,
                        title: filtered ? NO_REGISTER_RETURNS : NO_RETURNS,
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
                      {...cloudTableState(data, REPORT_NAME)}
                      empty={{
                        icon: <Undo2 />,
                        title: filtered ? NO_REGISTER_RETURNS : NO_RETURNS,
                        variant: filtered ? "filtered" : "blank",
                      }}
                    />
                  </section>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
