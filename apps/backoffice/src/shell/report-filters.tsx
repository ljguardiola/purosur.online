import { reportQuerySchema } from "@purosur/contracts";
import { type DateRange, DateRangeField } from "@purosur/ui";
import { type ReactNode, Suspense, useState } from "react";
import { calendarDateOf, dayOf, hasFourDigitYear } from "./report-day";
import type { ReportRegisterField } from "./report-register-field";

export type ReportFiltersProps<Filters extends PeriodFilters> = {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  answeredPeriod: { from: string; to: string } | undefined;
  registerFilter?: ReportRegisterField;
  onRegisterLabelChange?: (label: string | undefined) => void;
  trailing?: ReactNode;
};

export type PeriodFilters = { from: string; to: string; register?: string };

type PeriodDraft = DateRange | "incomplete";

function typedRange({ start, end }: DateRange): { from: string; to: string } | null {
  if (!hasFourDigitYear(start) || !hasFourDigitYear(end)) {
    return null;
  }
  return { from: dayOf(start), to: dayOf(end) };
}

export function ReportFilters<Filters extends PeriodFilters>({
  filters,
  onFiltersChange,
  answeredPeriod,
  registerFilter,
  onRegisterLabelChange,
  trailing,
}: ReportFiltersProps<Filters>) {
  const [draft, setDraft] = useState<PeriodDraft | null>(null);

  const shownPeriod = filters.from === "" ? answeredPeriod : { from: filters.from, to: filters.to };
  const shownRange: DateRange | null = shownPeriod
    ? { start: calendarDateOf(shownPeriod.from), end: calendarDateOf(shownPeriod.to) }
    : null;
  const period = draft === "incomplete" ? null : (draft ?? shownRange);

  const typed = period === null ? null : typedRange(period);
  const periodRefused = typed !== null && !reportQuerySchema.safeParse(typed).success;

  function changePeriod(next: DateRange | null) {
    const nextTyped = next === null ? null : typedRange(next);
    if (next === null) {
      setDraft("incomplete");
    } else if (nextTyped !== null && reportQuerySchema.safeParse(nextTyped).success) {
      setDraft(null);
      onFiltersChange({ ...filters, ...nextTyped });
    } else {
      setDraft(next);
    }
  }

  function emptyPeriod() {
    setDraft(null);
    onFiltersChange({ ...filters, from: "", to: "" });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <DateRangeField
        name="period"
        label="Período"
        value={period}
        onChange={changePeriod}
        onEmptied={emptyPeriod}
        errorMessage={
          periodRefused ? "La fecha de fin no puede ser anterior a la de inicio." : undefined
        }
      />
      <Suspense fallback={null}>
        {registerFilter?.({
          value: filters.register ?? "ALL",
          onChange: (register) => onFiltersChange({ ...filters, register }),
          ...(onRegisterLabelChange === undefined ? {} : { onLabelChange: onRegisterLabelChange }),
        })}
      </Suspense>
      {trailing === undefined ? null : <div className="ml-auto">{trailing}</div>}
    </div>
  );
}
