import type { IssuedFiscalDocumentsReportBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  formatPointOfSaleNumber,
  formatSignedCents,
  formatTenthsOfPercent,
  LoadFailure,
  plural,
  Table,
  useTableModel,
} from "@purosur/ui";
import { FileText } from "lucide-react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { cloudTableState } from "../platform/cloud-table-state";
import { ReportFilters } from "../shell/report-filters";
import {
  type ReportFilters as ReportFiltersValue,
  reportQueryOf,
} from "../shell/report-filters-search";
import type { ReportRegisterField } from "../shell/report-register-field";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { useIssuedFiscalDocumentsReportQuery } from "./fiscal-queries";
import { voucherTypeText } from "./issued-fiscal-document-text";
import type { IssuedFiscalDocumentsReportScreenServices } from "./issued-fiscal-documents-report-services";

export type IssuedFiscalDocumentsReportScreenProps = {
  filters: ReportFiltersValue;
  onFiltersChange: (filters: ReportFiltersValue) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: IssuedFiscalDocumentsReportScreenServices;
};

type ReportRow = IssuedFiscalDocumentsReportBody["rows"][number];

const NO_ROWS: ReportRow[] = [];

const NO_FIGURE = "—";
const NO_DOCUMENTS = "No se emitieron comprobantes en este período";
const NO_REGISTER_DOCUMENTS = "Esta caja no emitió comprobantes en este período";

const reportColumns = [
  dataColumn({
    id: "voucher_type",
    header: "Comprobante",
    render: (row: ReportRow) => voucherTypeText(row.voucher_type),
  }),
  dataColumn({
    id: "point_of_sale",
    header: "Punto de venta",
    render: (row: ReportRow) => formatPointOfSaleNumber(row.point_of_sale),
  }),
  dataColumn({
    id: "authorization",
    header: "Autorización",
    render: (row: ReportRow) => (row.authorization_kind === "cae" ? "CAE" : "CAEA"),
  }),
  dataColumn({
    id: "count",
    header: "Cantidad",
    align: "end",
    render: (row: ReportRow) => formatNumber(row.count),
  }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    render: (row: ReportRow) => formatSignedCents(row.amount),
  }),
] as const;

export function IssuedFiscalDocumentsReportScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: IssuedFiscalDocumentsReportScreenProps) {
  const filtered = filters.register !== "ALL";
  const data = useIssuedFiscalDocumentsReportQuery({
    query: reportQueryOf(filters),
    fetchIssuedFiscalDocumentsReport: services.fetchIssuedFiscalDocumentsReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.rows ?? NO_ROWS,
    id: (row) => `${row.kind}-${row.voucher_type}-${row.point_of_sale}-${row.authorization_kind}`,
    columns: reportColumns,
  });

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Fiscal" title="Comprobantes emitidos" />}
      bodyClassName="gap-4 p-6"
    >
      <ReportFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        answeredPeriod={shown?.range}
        registerFilter={registerFilter}
      />
      {data.status === "failed" ? (
        <LoadFailure {...cloudLoadFailure(data, "el reporte de comprobantes emitidos")} />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            {shown ? (
              <>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Facturas"
                    detail={plural(shown.totals.receipts.count, {
                      one: "1 factura",
                      other: `${formatNumber(shown.totals.receipts.count)} facturas`,
                    })}
                    value={formatCents(shown.totals.receipts.amount)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Notas de crédito"
                    detail={plural(shown.totals.credit_notes.count, {
                      one: "1 nota",
                      other: `${formatNumber(shown.totals.credit_notes.count)} notas`,
                    })}
                    value={formatSignedCents(shown.totals.credit_notes.amount)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Total neto"
                    value={formatSignedCents(shown.totals.amount)}
                  />
                </Card>
                <Card>
                  <FigureStat
                    size="heading"
                    label="Emitidos con CAEA"
                    detail={
                      shown.totals.contingency.share_tenths_of_percent === null
                        ? NO_FIGURE
                        : `${formatTenthsOfPercent(shown.totals.contingency.share_tenths_of_percent)} del total`
                    }
                    value={formatNumber(shown.totals.contingency.count)}
                  />
                </Card>
              </>
            ) : (
              <>
                <Card>
                  <FigureStat size="heading" label="Facturas" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Notas de crédito" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Total neto" loading />
                </Card>
                <Card>
                  <FigureStat size="heading" label="Emitidos con CAEA" loading />
                </Card>
              </>
            )}
          </div>
          <Table
            aria-label="Comprobantes emitidos"
            table={table}
            {...cloudTableState(data, "el reporte de comprobantes emitidos")}
            empty={{
              icon: <FileText />,
              title: filtered ? NO_REGISTER_DOCUMENTS : NO_DOCUMENTS,
              variant: filtered ? "filtered" : "blank",
            }}
          />
        </>
      )}
    </ScreenLayout>
  );
}
