import {
  Card,
  FigureStat,
  formatNumber,
  formatSignedCents,
  Table,
  useTableModel,
} from "@purosur/ui";
import { Calculator } from "lucide-react";
import { useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { RegisterReportDownload } from "../shell/report-download";
import { reportFileName } from "../shell/report-file-name";
import { ReportFilters } from "../shell/report-filters";
import {
  type ReportFilters as ReportFiltersValue,
  reportQueryOf,
} from "../shell/report-filters-search";
import type { ReportRegisterField } from "../shell/report-register-field";
import { type CashSessionCloseRow, cashSessionCloseColumns } from "./cash-session-closes-columns";
import type { CashSessionClosesScreenServices } from "./cash-session-closes-services";
import { cashSessionClosesSpreadsheet } from "./cash-session-closes-spreadsheet";
import { cashiersWithDifferenceText } from "./cash-session-closes-text";
import { useCashSessionClosesQuery } from "./register-queries";

export type CashSessionClosesScreenProps = {
  filters: ReportFiltersValue;
  onFiltersChange: (filters: ReportFiltersValue) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: CashSessionClosesScreenServices;
};

const NO_SESSIONS: CashSessionCloseRow[] = [];

const SCREEN_TITLE = "Cierres de caja";

export function CashSessionClosesScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: CashSessionClosesScreenProps) {
  const [registerLabel, setRegisterLabel] = useState<string>();
  const data = useCashSessionClosesQuery({
    query: reportQueryOf(filters),
    fetchCashSessionCloses: services.fetchCashSessionCloses,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.sessions ?? NO_SESSIONS,
    id: (session) => session.id,
    columns: cashSessionCloseColumns,
  });

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
              shown
                ? cashSessionClosesSpreadsheet(
                    shown,
                    table.getRowModel().rows.map((row) => row.original),
                    registerLabel,
                  )
                : null
            }
            fileName={shown ? reportFileName(SCREEN_TITLE, shown.range) : ""}
          />
        }
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
      <Table
        aria-label={SCREEN_TITLE}
        table={table}
        {...cloudTableState(data, "los cierres de sesión")}
        empty={{
          icon: <Calculator />,
          title: "No hay sesiones cerradas en este período",
          variant: filters.register === "ALL" ? "blank" : "filtered",
        }}
      />
    </div>
  );
}
