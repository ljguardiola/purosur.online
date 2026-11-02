import type { ExceptionShareYearBody } from "@purosur/contracts";
import {
  dataColumn,
  formatDuration,
  formatNumber,
  formatPercent,
  formatTenthsOfPercent,
  formatYear,
  groupColumn,
  ListFilter,
  StatusIndicator,
  Table,
  TableCellText,
  type Tone,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { FileSearch, Percent } from "lucide-react";
import { useEffect, useEffectEvent } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { combineCloudData } from "../platform/combine-cloud-data";
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

type ContingencyTime = MonthShare["contingency_time"];

const CONTINGENCY_STATES = {
  ...STATES,
  no_data: { tone: "neutral", label: "Sin datos" },
} as const satisfies Record<ContingencyTime["state"], { tone: Tone; label: string }>;

function contingencyFigure(month: MonthShare, figure: (time: ContingencyTime) => string): string {
  return month.contingency_time.state === "no_data" ? "—" : figure(month.contingency_time);
}

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
  groupColumn({
    id: "contingencyTime",
    header: "Tiempo en contingencia",
    columns: [
      dataColumn({
        id: "contingencyDuration",
        header: "En contingencia",
        align: "end",
        render: (month: MonthShare) =>
          contingencyFigure(month, ({ contingency_ms }) => formatDuration(contingency_ms)),
      }),
      dataColumn({
        id: "availableDuration",
        header: "ARCA disponible",
        align: "end",
        render: (month: MonthShare) =>
          contingencyFigure(month, ({ available_ms }) => formatDuration(available_ms)),
      }),
      dataColumn({
        id: "contingencyShare",
        header: "Porcentaje",
        align: "end",
        render: (month: MonthShare) =>
          contingencyFigure(month, ({ share_tenths_of_percent }) =>
            share_tenths_of_percent === null ? "—" : formatTenthsOfPercent(share_tenths_of_percent),
          ),
      }),
      dataColumn({
        id: "contingencyState",
        header: "Estado",
        render: (month: MonthShare) => (
          <StatusIndicator tone={CONTINGENCY_STATES[month.contingency_time.state].tone}>
            {CONTINGENCY_STATES[month.contingency_time.state].label}
          </StatusIndicator>
        ),
      }),
    ],
  }),
] as const;

function nonCompliantMonthsText(year: ExceptionShareYearBody): string {
  return year.non_compliant_months.length === 0
    ? `Ningún mes incumplió por comprobantes por excepción en ${formatYear(year.year)}`
    : `Meses que incumplieron por comprobantes por excepción en ${formatYear(year.year)}: ${year.non_compliant_months.map(monthNameOf).join(", ")}`;
}

function nonCompliantContingencyMonthsText(year: ExceptionShareYearBody): string {
  return year.contingency_non_compliant_months.length === 0
    ? `Ningún mes incumplió por tiempo en contingencia en ${formatYear(year.year)}`
    : `Meses que incumplieron por tiempo en contingencia en ${formatYear(year.year)}: ${year.contingency_non_compliant_months.map(monthNameOf).join(", ")}`;
}

function addressOption({ id, name }: { id: string; name: string }) {
  return { value: id, label: name };
}

function yearOption(year: number) {
  return { value: String(year), label: formatYear(year) };
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
  const reportFilters = useEffectEvent(onFiltersChange);
  const listedAddresses = addresses.status === "loaded" ? addresses.value : [];
  const [firstAddress, ...otherAddresses] = listedAddresses;
  const fiscalAddressFilter =
    addresses.status === "loaded" && !listedAddresses.some(({ id }) => id === filters.fiscalAddress)
      ? ""
      : filters.fiscalAddress;
  const fiscalAddressId = fiscalAddressFilter === "" ? firstAddress?.id : fiscalAddressFilter;
  const read = useExceptionShareYearQuery({
    fiscalAddressId: addresses.status === "loaded" ? fiscalAddressId : undefined,
    year: filters.year,
    fetchExceptionShareYear: services.fetchExceptionShareYear,
    onSessionEnded,
  });
  const noFiscalAddresses = addresses.status === "loaded" && firstAddress === undefined;
  const data =
    addresses.status !== "loaded" || noFiscalAddresses
      ? addresses
      : combineCloudData(addresses, read);
  const shown =
    read.status === "loaded" && read.value.kind === "found" ? read.value.year : undefined;
  const lastRead = read.status === "loaded" ? undefined : read.lastValue;
  const answered = shown ?? (lastRead?.kind === "found" ? lastRead.year : undefined);
  const yearFilter =
    shown !== undefined &&
    filters.year !== undefined &&
    !shown.selectable_years.includes(filters.year)
      ? undefined
      : filters.year;

  useEffect(() => {
    const shownFilters: ExceptionalityFilters = {
      fiscalAddress: fiscalAddressFilter,
      ...(yearFilter === undefined ? {} : { year: yearFilter }),
    };
    if (!deepEqual(shownFilters, filters)) {
      reportFilters(shownFilters);
    }
  }, [fiscalAddressFilter, yearFilter, filters]);
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
          comprobantes emitidos por excepción (CAEA), o cuando el tiempo en contingencia supera el{" "}
          {formatPercent(answered.contingency_non_compliance_percent)} del tiempo en que ARCA estuvo
          disponible. ARCA puede restringir el uso del CAEA; en el mostrador no se restringe nada.
        </p>
      )}
      {shown === undefined ? null : (
        <>
          <p className="font-bold text-detail">{nonCompliantMonthsText(shown)}</p>
          <p className="font-bold text-detail">{nonCompliantContingencyMonthsText(shown)}</p>
        </>
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
