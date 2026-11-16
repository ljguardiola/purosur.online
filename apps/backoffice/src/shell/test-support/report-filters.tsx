import { FieldSizeProvider } from "@purosur/ui";
import { useState } from "react";
import { ReportFilters, type ReportFiltersProps } from "../report-filters";
import {
  type ReportFilters as ReportFiltersValue,
  reportFiltersSearch,
} from "../report-filters-search";
import { render } from "./render-with-router";

type AnsweredPeriod = ReportFiltersProps<ReportFiltersValue>["answeredPeriod"];

export type ControlledReportFiltersProps = Omit<
  ReportFiltersProps<ReportFiltersValue>,
  "filters" | "onFiltersChange" | "answeredPeriod"
> & {
  filters?: ReportFiltersValue;
  onFiltersChange?: (filters: ReportFiltersValue) => void;
  answeredPeriodOf: (filters: ReportFiltersValue) => AnsweredPeriod;
};

function ControlledReportFilters({
  filters: initial = reportFiltersSearch.parse({}),
  onFiltersChange = () => {},
  answeredPeriodOf,
  ...props
}: ControlledReportFiltersProps) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ReportFilters
          {...props}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          answeredPeriod={answeredPeriodOf(filters)}
        />
      </main>
    </FieldSizeProvider>
  );
}

export function renderReportFilters(props: ControlledReportFiltersProps) {
  return render(<ControlledReportFilters {...props} />);
}
