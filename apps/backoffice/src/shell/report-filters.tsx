import type { CalendarDate } from "@internationalized/date";
import { reportQuerySchema } from "@purosur/contracts";
import { DateField, ListFilter, sortedItems, textOrder } from "@purosur/ui";
import { useEffect, useEffectEvent, useState } from "react";
import { calendarDateOf, dayOf, hasFourDigitYear } from "./report-day";
import type { ReportFilters as ReportFiltersValue } from "./report-filters-search";
import type { fetchReportRegisters } from "./report-registers-api";
import { useReportRegistersQuery } from "./report-registers-queries";

export type ReportFiltersProps = {
  filters: ReportFiltersValue;
  onFiltersChange: (filters: ReportFiltersValue) => void;
  onSessionEnded: () => void;
  fetchReportRegisters: typeof fetchReportRegisters;
  answeredPeriod: { from: string; to: string } | undefined;
};

type RangeDraft = { from: CalendarDate | null; to: CalendarDate | null };

function typedRange({ from, to }: RangeDraft): { from: string; to: string } | null {
  if (from === null || to === null || !hasFourDigitYear(from) || !hasFourDigitYear(to)) {
    return null;
  }
  return { from: dayOf(from), to: dayOf(to) };
}

const registerOrder = textOrder((register: { label: string }) => register.label);

export function ReportFilters({
  filters,
  onFiltersChange,
  onSessionEnded,
  fetchReportRegisters,
  answeredPeriod,
}: ReportFiltersProps) {
  const [draft, setDraft] = useState<RangeDraft | null>(null);
  const reportFilters = useEffectEvent(onFiltersChange);
  const registerChosen = filters.register !== "ALL";

  const registers = useReportRegistersQuery({ fetchReportRegisters, onSessionEnded });
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

  const shownPeriod = filters.from === "" ? answeredPeriod : { from: filters.from, to: filters.to };
  const range: RangeDraft = draft ?? {
    from: shownPeriod ? calendarDateOf(shownPeriod.from) : null,
    to: shownPeriod ? calendarDateOf(shownPeriod.to) : null,
  };

  const typed = typedRange(range);
  const rangeRefused = typed !== null && !reportQuerySchema.safeParse(typed).success;

  function changeRange(next: RangeDraft) {
    const nextTyped = typedRange(next);
    if (next.from === null && next.to === null) {
      setDraft(null);
      onFiltersChange({ ...filters, from: "", to: "" });
    } else if (nextTyped !== null && reportQuerySchema.safeParse(nextTyped).success) {
      setDraft(null);
      onFiltersChange({ ...filters, ...nextTyped });
    } else {
      setDraft(next);
    }
  }

  return (
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
  );
}
