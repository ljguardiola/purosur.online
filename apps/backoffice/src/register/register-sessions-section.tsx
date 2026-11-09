import { ButtonLink, Table, useTableModel } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { Calculator, ExternalLink } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { RegisterSessionsSectionProps as RegisterSessionsSlotProps } from "../platform/register-panel-sections";
import { ReportFilters } from "../shell/report-filters";
import { reportQueryOf } from "../shell/report-filters-search";
import { fetchCashSessionCloses } from "./cash-session-closes-api";
import {
  type CashSessionCloseRow,
  registerSessionCloseColumns,
} from "./cash-session-closes-columns";
import { useCashSessionClosesQuery } from "./register-queries";

export type RegisterSessionsSectionServices = {
  fetchCashSessionCloses: typeof fetchCashSessionCloses;
};

export type RegisterSessionsSectionProps = RegisterSessionsSlotProps & {
  services?: RegisterSessionsSectionServices | undefined;
};

const defaultRegisterSessionsSectionServices: RegisterSessionsSectionServices = {
  fetchCashSessionCloses,
};

const ClosesLink = createLink(ButtonLink);

const NO_SESSIONS: CashSessionCloseRow[] = [];

export function RegisterSessionsSection({
  registerId,
  period,
  onPeriodChange,
  onSessionEnded,
  services = defaultRegisterSessionsSectionServices,
}: RegisterSessionsSectionProps) {
  const data = useCashSessionClosesQuery({
    query: reportQueryOf({ ...period, register: registerId }),
    fetchCashSessionCloses: services.fetchCashSessionCloses,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.sessions ?? NO_SESSIONS,
    id: (session) => session.id,
    columns: registerSessionCloseColumns,
  });

  return (
    <div className="flex flex-col gap-4 pt-4">
      <ReportFilters
        filters={period}
        onFiltersChange={onPeriodChange}
        answeredPeriod={shown?.range}
        trailing={
          <ClosesLink
            to="/registers/closes"
            search={{
              register: registerId,
              ...(period.from === "" ? {} : { from: period.from, to: period.to }),
            }}
            variant="text"
            icon={<ExternalLink />}
          >
            Ver en Cierres de caja
          </ClosesLink>
        }
      />
      <Table
        aria-label="Cierres de caja de la caja"
        table={table}
        {...cloudTableState(data, "los cierres de sesión")}
        empty={{
          icon: <Calculator />,
          title: "No hay sesiones cerradas en este período",
          variant: "blank",
        }}
      />
    </div>
  );
}
