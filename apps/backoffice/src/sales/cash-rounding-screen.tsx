import type { CashRoundingBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  Table,
  useTableModel,
} from "@purosur/ui";
import { Coins } from "lucide-react";
import { useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { RegisterReportDownload } from "../shell/report-download";
import { reportFileName } from "../shell/report-file-name";
import { ReportFilters } from "../shell/report-filters";
import {
  type ReportFilters as ReportFiltersValue,
  reportQueryOf,
} from "../shell/report-filters-search";
import type { ReportRegisterField } from "../shell/report-register-field";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { CashRoundingScreenServices } from "./cash-rounding-services";
import { cashRoundingSpreadsheet } from "./cash-rounding-spreadsheet";
import { useCashRoundingQuery } from "./sales-queries";

export type CashRoundingScreenProps = {
  filters: ReportFiltersValue;
  onFiltersChange: (filters: ReportFiltersValue) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: CashRoundingScreenServices;
};

type RoundingOfDay = CashRoundingBody["rows"][number];

const NO_ROWS: RoundingOfDay[] = [];

const SCREEN_TITLE = "Redondeo en efectivo";

const columns = [
  dataColumn({
    id: "day",
    header: "Día",
    render: (row: RoundingOfDay) => formatDisplayDate(row.day),
  }),
  dataColumn({
    id: "register",
    header: "Caja",
    render: (row: RoundingOfDay) => row.register_name,
  }),
  dataColumn({
    id: "rounded",
    header: "Redondeo",
    align: "end",
    render: (row: RoundingOfDay) => formatCents(row.rounded),
  }),
  dataColumn({
    id: "roundedSales",
    header: "Ventas redondeadas",
    align: "end",
    render: (row: RoundingOfDay) => formatNumber(row.rounded_sale_count),
  }),
] as const;

export function CashRoundingScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: CashRoundingScreenProps) {
  const registerChosen = filters.register !== "ALL";
  const [registerLabel, setRegisterLabel] = useState<string>();
  const data = useCashRoundingQuery({
    query: reportQueryOf(filters),
    fetchCashRounding: services.fetchCashRounding,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const rows = shown?.rows ?? NO_ROWS;
  const table = useTableModel({
    items: rows,
    id: (row) => `${row.day}/${row.register_id}`,
    columns,
  });

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes" title={SCREEN_TITLE} />}
      bodyClassName="gap-4 p-6"
    >
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
              shown
                ? cashRoundingSpreadsheet(
                    { ...shown, rows: table.getRowModel().rows.map((row) => row.original) },
                    registerLabel,
                  )
                : null
            }
            fileName={shown ? reportFileName(SCREEN_TITLE, shown.range) : ""}
          />
        }
      />
      {data.status === "failed" ? null : (
        <Card>
          <div className="grid grid-cols-2 gap-6">
            {shown ? (
              <>
                <FigureStat
                  size="heading"
                  label="Redondeo total"
                  value={formatCents(shown.totals.rounded)}
                />
                <FigureStat
                  size="heading"
                  label="Ventas redondeadas"
                  value={formatNumber(shown.totals.rounded_sale_count)}
                />
              </>
            ) : (
              <>
                <FigureStat size="heading" label="Redondeo total" loading />
                <FigureStat size="heading" label="Ventas redondeadas" loading />
              </>
            )}
          </div>
        </Card>
      )}
      <Table
        aria-label="Redondeo por día y caja"
        table={table}
        {...cloudTableState(data, "el reporte de redondeo")}
        empty={{
          icon: <Coins />,
          title: "No hubo redondeo en efectivo en el período.",
          variant: registerChosen ? "filtered" : "blank",
        }}
      />
    </ScreenLayout>
  );
}
