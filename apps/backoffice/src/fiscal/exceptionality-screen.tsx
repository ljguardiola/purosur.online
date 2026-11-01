import type { ExceptionShareYearBody } from "@purosur/contracts";
import {
  dataColumn,
  formatNumber,
  formatPercent,
  formatTenthsOfPercent,
  groupColumn,
  ListFilter,
  StatusIndicator,
  Table,
  TableCellText,
  type Tone,
  useTableModel,
} from "@purosur/ui";
import { FileSearch, Percent } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { CloudData } from "../platform/use-cloud-query";
import { monthNameOf, yearMonthLabel } from "../platform/year-month-label";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { ExceptionalityFilters } from "./exceptionality-filters";
import type { ExceptionalityScreenServices } from "./exceptionality-services";
import { useExceptionShareYearQuery, useFiscalAddressesQuery } from "./fiscal-queries";

export type ExceptionalityScreenProps = {
  filters: ExceptionalityFilters;
  onFiltersChange: (filters: ExceptionalityFilters) => void;
  onSessionEnded: () => void;
  services: ExceptionalityScreenServices;
};

type MonthShare = ExceptionShareYearBody["months"][number];

const NO_MONTHS: MonthShare[] = [];

const STATES = {
  non_compliant: { tone: "error", label: "Incumple" },
  compliant: { tone: "success", label: "Dentro del límite" },
  in_progress: { tone: "neutral", label: "En curso" },
} as const satisfies Record<MonthShare["state"], { tone: Tone; label: string }>;

const columns = [
  dataColumn({
    id: "month",
    header: "Mes",
    render: (month: MonthShare) => (
      <TableCellText strong>{yearMonthLabel(month.month)}</TableCellText>
    ),
  }),
  groupColumn({
    id: "exceptionVouchers",
    header: "Comprobantes por excepción",
    columns: [
      dataColumn({
        id: "exceptionCount",
        header: "Por excepción (CAEA)",
        align: "end",
        render: (month: MonthShare) => formatNumber(month.exception_count),
      }),
      dataColumn({
        id: "totalCount",
        header: "Total",
        align: "end",
        render: (month: MonthShare) => formatNumber(month.total_count),
      }),
      dataColumn({
        id: "share",
        header: "Porcentaje",
        align: "end",
        render: (month: MonthShare) =>
          month.share_tenths_of_percent === null
            ? "—"
            : formatTenthsOfPercent(month.share_tenths_of_percent),
      }),
      dataColumn({
        id: "state",
        header: "Estado",
        render: (month: MonthShare) => (
          <StatusIndicator tone={STATES[month.state].tone}>
            {STATES[month.state].label}
          </StatusIndicator>
        ),
      }),
    ],
  }),
] as const;

function nonCompliantMonthsText(year: ExceptionShareYearBody): string {
  return year.non_compliant_months.length === 0
    ? `Ningún mes incumplió en ${year.year}`
    : `Meses que incumplieron en ${year.year}: ${year.non_compliant_months.map(monthNameOf).join(", ")}`;
}

function addressOption({ id, name }: { id: string; name: string }) {
  return { value: id, label: name };
}

function yearOption(year: number) {
  return { value: String(year), label: String(year) };
}

function emptyStateOf(noFiscalAddresses: boolean) {
  return noFiscalAddresses
    ? { icon: <FileSearch />, title: "No hay domicilios fiscales", variant: "blank" as const }
    : {
        icon: <Percent />,
        title: "No encontramos ese domicilio fiscal",
        variant: "filtered" as const,
      };
}

export function ExceptionalityScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: ExceptionalityScreenProps) {
  const addresses = useFiscalAddressesQuery({
    fetchFiscalAddresses: services.fetchFiscalAddresses,
    onSessionEnded,
  });
  const [firstAddress, ...otherAddresses] = addresses.status === "loaded" ? addresses.value : [];
  const fiscalAddressId = filters.fiscalAddress === "" ? firstAddress?.id : filters.fiscalAddress;
  const read = useExceptionShareYearQuery({
    fiscalAddressId: addresses.status === "loaded" ? fiscalAddressId : undefined,
    year: filters.year,
    fetchExceptionShareYear: services.fetchExceptionShareYear,
    onSessionEnded,
  });
  const noFiscalAddresses = addresses.status === "loaded" && firstAddress === undefined;
  const data: CloudData<unknown> =
    addresses.status === "loaded" && !noFiscalAddresses ? read : addresses;
  const shown =
    read.status === "loaded" && read.value.kind === "found" ? read.value.year : undefined;
  const lastRead = read.status === "loaded" ? undefined : read.lastValue;
  const answered = shown ?? (lastRead?.kind === "found" ? lastRead.year : undefined);
  const table = useTableModel({
    items: shown?.months ?? NO_MONTHS,
    id: (month) => month.month,
    columns,
  });

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Caja y fiscal · Fiscal" title="Excepcionalidad" />}
      bodyClassName="gap-4 p-6"
    >
      {firstAddress === undefined ? null : (
        <div className="flex flex-wrap items-end gap-3">
          <ListFilter
            name="fiscalAddress"
            label="Domicilio fiscal:"
            options={[addressOption(firstAddress), ...otherAddresses.map(addressOption)]}
            value={fiscalAddressId ?? ""}
            onChange={(fiscalAddress) => onFiltersChange({ ...filters, fiscalAddress })}
          />
          {answered === undefined ? null : (
            <ListFilter
              name="year"
              label="Año:"
              options={[
                yearOption(answered.selectable_years[0]),
                ...answered.selectable_years.slice(1).map(yearOption),
              ]}
              value={String(answered.year)}
              onChange={(year) => onFiltersChange({ ...filters, year: Number(year) })}
            />
          )}
        </div>
      )}
      {answered === undefined ? null : (
        <p className="text-text-subtle text-detail">
          Un mes incumple al llegar al {formatPercent(answered.non_compliance_percent)} de
          comprobantes emitidos por excepción (CAEA). ARCA puede restringir el uso del CAEA; en el
          mostrador no se restringe nada.
        </p>
      )}
      {shown === undefined ? null : (
        <p className="font-bold text-detail">{nonCompliantMonthsText(shown)}</p>
      )}
      <Table
        aria-label="Excepcionalidad por mes"
        table={table}
        {...cloudTableState(data, "la excepcionalidad")}
        empty={emptyStateOf(noFiscalAddresses)}
      />
    </ScreenLayout>
  );
}
