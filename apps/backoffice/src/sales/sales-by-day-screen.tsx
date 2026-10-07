import type { CalendarDate } from "@internationalized/date";
import type { SalesReportBody, SalesReportQuery } from "@purosur/contracts";
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
import { ScreenLayout } from "../shell/screen-layout";
import { calendarDateOf, dayOf, formatReportDay, hasFourDigitYear } from "./report-day";
import type { SalesByDayFilters } from "./sales-by-day-filters";
import type { SalesByDayScreenServices } from "./sales-by-day-services";
import { useReportRegistersQuery, useSalesReportQuery } from "./sales-queries";
import { SalesTopBar } from "./sales-screen-parts";

export type SalesByDayScreenProps = {
  filters: SalesByDayFilters;
  onFiltersChange: (filters: SalesByDayFilters) => void;
  onSessionEnded: () => void;
  services: SalesByDayScreenServices;
};

type SalesOfDay = SalesReportBody["days"][number];

type RangeDraft = { from: CalendarDate | null; to: CalendarDate | null };

const NO_DAYS: SalesOfDay[] = [];

const registerOrder = textOrder((register: { label: string }) => register.label);

const columns = [
  dataColumn({
    id: "day",
    header: "Día",
    render: (sales: SalesOfDay) => formatReportDay(sales.day),
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
  const registerOptions = [
    { value: "ALL", label: "Todas" },
    ...sortedItems(
      registers.status === "loaded"
        ? registers.value.registers.map(({ id, name }) => ({ value: id, label: name }))
        : [],
      { order: registerOrder, direction: "ascending" },
    ),
  ] satisfies [{ value: string; label: string }, ...{ value: string; label: string }[]];
  const registerOffered = registerOptions.some((option) => option.value === filters.register);
  const registersSettled = registers.status !== "loading";

  useEffect(() => {
    if (registersSettled && !registerOffered) {
      reportFilters({ ...filters, register: "ALL" });
    }
  }, [registersSettled, registerOffered, filters]);

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

  function changeRange(next: RangeDraft) {
    if (next.from === null && next.to === null) {
      setDraft(null);
      onFiltersChange({ ...filters, from: "", to: "" });
    } else if (
      next.from !== null &&
      next.to !== null &&
      hasFourDigitYear(next.from) &&
      hasFourDigitYear(next.to) &&
      next.from.compare(next.to) <= 0
    ) {
      setDraft(null);
      onFiltersChange({ ...filters, from: dayOf(next.from), to: dayOf(next.to) });
    } else {
      setDraft(next);
    }
  }

  const endField = {
    label: "Hasta",
    value: range.to,
    onChange: (to: CalendarDate | null) => changeRange({ ...range, to }),
  };

  return (
    <ScreenLayout
      topBar={<SalesTopBar eyebrow="Reportes" title="Ventas por día o por rango" />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <DateField
          label="Desde"
          value={range.from}
          onChange={(from) => changeRange({ ...range, from })}
        />
        {range.from === null ? (
          <DateField {...endField} />
        ) : (
          <DateField
            {...endField}
            minValue={range.from}
            rangeMessage="La fecha de fin no puede ser anterior a la de inicio."
          />
        )}
        <ListFilter
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
