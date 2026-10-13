import type { CalendarDate } from "@internationalized/date";
import { reportQuerySchema } from "@purosur/contracts";
import { DateField } from "@purosur/ui";
import { Suspense, useContext, useState } from "react";
import { calendarDateOf, dayOf, hasFourDigitYear } from "./report-day";
import type { ReportFilters as ReportFiltersValue } from "./report-filters-search";
import { ReportRegisterFilterSlot } from "./report-register-filter-slot";

export type ReportFiltersProps<Filters extends ReportFiltersValue> = {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  answeredPeriod: { from: string; to: string } | undefined;
};

type RangeDraft = { from: CalendarDate | null; to: CalendarDate | null };

function typedRange({ from, to }: RangeDraft): { from: string; to: string } | null {
  if (from === null || to === null || !hasFourDigitYear(from) || !hasFourDigitYear(to)) {
    return null;
  }
  return { from: dayOf(from), to: dayOf(to) };
}

export function ReportFilters<Filters extends ReportFiltersValue>({
  filters,
  onFiltersChange,
  answeredPeriod,
}: ReportFiltersProps<Filters>) {
  const [draft, setDraft] = useState<RangeDraft | null>(null);
  const registerFilter = useContext(ReportRegisterFilterSlot);

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
      <Suspense fallback={null}>
        {registerFilter({
          value: filters.register,
          onChange: (register) => onFiltersChange({ ...filters, register }),
        })}
      </Suspense>
    </div>
  );
}
