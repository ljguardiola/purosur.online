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

type PeriodDraft = DateRange | null;

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
  const [draft, setDraft] = useState<PeriodDraft>(null);

  const shownPeriod = filters.from === "" ? answeredPeriod : { from: filters.from, to: filters.to };
  const period: PeriodDraft =
    draft ??
    (shownPeriod
      ? { start: calendarDateOf(shownPeriod.from), end: calendarDateOf(shownPeriod.to) }
      : null);

  function changePeriod(next: PeriodDraft) {
    const nextTyped = next === null ? null : typedRange(next);
    if (next === null) {
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
      <DateRangeField name="period" label="Período" value={period} onChange={changePeriod} />
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
