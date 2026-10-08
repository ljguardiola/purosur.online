import type { CalendarDate } from "@internationalized/date";
import {
  type SalesReportBody,
  type SalesReportQuery,
  salesReportQuerySchema,
} from "@purosur/contracts";
import {
  Card,
  DateField,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  ListFilter,
  sortedItems,
  Table,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { Receipt } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { calendarDateOf, dayOf, hasFourDigitYear } from "./report-day";
import type { SalesByDayFilters } from "./sales-by-day-filters";
import type { SalesByDayScreenServices } from "./sales-by-day-services";
import { useReportRegistersQuery, useSalesReportQuery } from "./sales-queries";

export type SalesByDayScreenProps = {
  filters: SalesByDayFilters;
  onFiltersChange: (filters: SalesByDayFilters) => void;
  onSessionEnded: () => void;
  services: SalesByDayScreenServices;
};

type SalesOfDay = SalesReportBody["days"][number];

type RangeDraft = { from: CalendarDate | null; to: CalendarDate | null };

const NO_DAYS: SalesOfDay[] = [];

function typedRange({ from, to }: RangeDraft): { from: string; to: string } | null {
  if (from === null || to === null || !hasFourDigitYear(from) || !hasFourDigitYear(to)) {
    return null;
  }
  return { from: dayOf(from), to: dayOf(to) };
}

const registerOrder = textOrder((register: { label: string }) => register.label);

const columns = [
  dataColumn({
    id: "day",
    header: "Día",
    render: (sales: SalesOfDay) => formatDisplayDate(sales.day),
  }),
  dataColumn({
    id: "sales",
    header: "Ventas",
    align: "end",
    render: (sales: SalesOfDay) => formatNumber(sales.sales_count),
  }),
  dataColumn({
    id: "total",
    header: "Total",
    align: "end",
    render: (sales: SalesOfDay) => formatCents(sales.total),
  }),
] as const;

export function SalesByDayScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: SalesByDayScreenProps) {
  const [draft, setDraft] = useState<RangeDraft | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);
  const registerChosen = filters.register !== "ALL";
  const query: SalesReportQuery = {
    ...(filters.from === "" ? {} : { from: filters.from, to: filters.to }),
    ...(registerChosen ? { register_id: filters.register } : {}),
  };

  const registers = useReportRegistersQuery({
    fetchReportRegisters: services.fetchReportRegisters,
    onSessionEnded,
  });
  const registersListed = registers.status === "loaded";
  const listedOptions = registersListed
    ? sortedItems(
        registers.value.registers.map(({ id, name }) => ({ value: id, label: name })),
        { order: registerOrder, direction: "ascending" },
      )
    : [];
  const chosenOption =
    registerChosen && !registersListed ? [{ value: filters.register, label: "La elegida" }] : [];
  const registerOptions = [
    { value: "ALL", label: "Todas" },
    ...chosenOption,
    ...listedOptions,
  ] satisfies [{ value: string; label: string }, ...{ value: string; label: string }[]];
  const registerOffered = registerOptions.some((option) => option.value === filters.register);

  useEffect(() => {
    if (registersListed && !registerOffered) {
      reportFilters({ ...filters, register: "ALL" });
    }
  }, [registersListed, registerOffered, filters]);

  const data = useSalesReportQuery({
    query,
    fetchSalesReport: services.fetchSalesReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const days = shown?.days ?? NO_DAYS;
  const table = useTableModel({ items: days, id: (sales) => sales.day, columns });

  const shownRange = filters.from === "" ? shown?.range : { from: filters.from, to: filters.to };
  const range: RangeDraft = draft ?? {
    from: shownRange ? calendarDateOf(shownRange.from) : null,
    to: shownRange ? calendarDateOf(shownRange.to) : null,
  };

  const typed = typedRange(range);
  const rangeRefused = typed !== null && !salesReportQuerySchema.safeParse(typed).success;

  function changeRange(next: RangeDraft) {
    const nextTyped = typedRange(next);
    if (next.from === null && next.to === null) {
      setDraft(null);
      onFiltersChange({ ...filters, from: "", to: "" });
    } else if (nextTyped !== null && salesReportQuerySchema.safeParse(nextTyped).success) {
      setDraft(null);
      onFiltersChange({ ...filters, ...nextTyped });
    } else {
      setDraft(next);
    }
  }

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes" title="Ventas por día o por rango" />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <DateField
          name="from"
          label="Desde"
          value={range.from}
          onChange={(from) => changeRange({ ...range, from })}
        />
        <DateField
          name="to"
          label="Hasta"
          value={range.to}
          onChange={(to) => changeRange({ ...range, to })}
          errorMessage={
            rangeRefused ? "La fecha de fin no puede ser anterior a la de inicio." : undefined
          }
        />
        <ListFilter
          name="register"
          label="Caja:"
          options={registerOptions}
          value={registerOffered ? filters.register : "ALL"}
          onChange={(register) => onFiltersChange({ ...filters, register })}
        />
      </div>
      {data.status === "failed" ? null : (
        <Card>
          <div className="grid grid-cols-2 gap-6">
            {shown ? (
              <>
                <FigureStat
                  size="heading"
                  label="Total vendido"
                  value={formatCents(shown.totals.total)}
                />
                <FigureStat
                  size="heading"
                  label="Cantidad de ventas"
                  value={formatNumber(shown.totals.sales_count)}
                />
              </>
            ) : (
              <>
                <FigureStat size="heading" label="Total vendido" loading />
                <FigureStat size="heading" label="Cantidad de ventas" loading />
              </>
            )}
          </div>
        </Card>
      )}
      <Table
        aria-label="Ventas por día"
        table={table}
        {...cloudTableState(data, "el reporte de ventas")}
        empty={{
          icon: <Receipt />,
          title: registerChosen
            ? "No hay ventas de esta caja en este período"
            : "No hay ventas en este período",
          variant: registerChosen ? "filtered" : "blank",
        }}
      />
    </ScreenLayout>
  );
}
