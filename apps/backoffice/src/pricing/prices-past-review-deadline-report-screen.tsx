import type { PricesPastReviewDeadlineReportBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCalendarDayNumeric,
  plural,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { TagX } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ReportFilters } from "../shell/report-filters";
import type { ReportPeriodFilters } from "../shell/report-filters-search";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { formatCentsWithUnit } from "./money";
import { lastReviewedText } from "./prices-past-review-deadline-moments";
import type { PricesPastReviewDeadlineReportScreenServices } from "./prices-past-review-deadline-report-services";
import { usePricesPastReviewDeadlineReportQuery } from "./pricing-queries";

export type PricesPastReviewDeadlineReportScreenProps = {
  filters: ReportPeriodFilters;
  onFiltersChange: (filters: ReportPeriodFilters) => void;
  onSessionEnded: () => void;
  services: PricesPastReviewDeadlineReportScreenServices;
};

type Price = PricesPastReviewDeadlineReportBody["prices"][number];

const NO_PRICES: Price[] = [];

const REASON_TEXT: Record<Price["reason"], string> = {
  overdue: "Plazo vencido",
  postponed: "Postergado en una compra",
  never_reviewed: "Nunca revisado",
};

function windowText(windowDays: number): string {
  return `Plazo de revisión: ${plural(windowDays, { one: "1 día", other: `${windowDays} días` })}`;
}

const columns = [
  dataColumn({
    id: "product",
    header: "Producto",
    render: (price: Price) => (
      <TableCellText>
        {formatProductDescription({
          name: price.product.name,
          brandName: price.product.brand_name,
          netContent: price.product.net_content,
        })}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "category",
    header: "Categoría",
    render: (price: Price) => (
      <TableCellText tone="subtle">{price.product.category_name}</TableCellText>
    ),
  }),
  dataColumn({
    id: "currentPrice",
    width: 160,
    header: "Precio actual",
    align: "end",
    render: (price: Price) =>
      price.current_price === null ? (
        <TableCellText tone="subtle">Sin precio</TableCellText>
      ) : (
        <TableCellText strong>
          {formatCentsWithUnit(price.current_price.unit_price_cents, price.product.sale_unit)}
        </TableCellText>
      ),
  }),
  dataColumn({
    id: "lastReviewed",
    width: 190,
    header: "Última revisión",
    render: (price: Price) => (
      <TableCellText tone={price.last_reviewed_at === null ? "subtle" : undefined}>
        {lastReviewedText(price.last_reviewed_at)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "pastDeadlineOn",
    width: 150,
    header: "Venció el",
    render: (price: Price) =>
      price.past_deadline_on === null ? (
        <TableCellText tone="subtle">—</TableCellText>
      ) : (
        <TableCellText>{formatCalendarDayNumeric(price.past_deadline_on)}</TableCellText>
      ),
  }),
  dataColumn({
    id: "reason",
    width: 200,
    header: "Motivo",
    render: (price: Price) => <TableCellText>{REASON_TEXT[price.reason]}</TableCellText>,
  }),
] as const;

export function PricesPastReviewDeadlineReportScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: PricesPastReviewDeadlineReportScreenProps) {
  const data = usePricesPastReviewDeadlineReportQuery({
    query: filters.from === "" ? {} : { from: filters.from, to: filters.to },
    fetchPricesPastReviewDeadlineReport: services.fetchPricesPastReviewDeadlineReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.prices ?? NO_PRICES,
    id: (price) => price.product.id,
    columns,
  });

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Precios" title="Precios sin revisar" />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          answeredPeriod={shown?.period}
        />
      </div>
      {data.status === "failed" || shown === undefined ? null : (
        <p className="text-detail text-text-subtle">{windowText(shown.window_days)}</p>
      )}
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            {data.status === "loaded" ? (
              <FigureStat
                size="heading"
                label="Precios"
                value={plural(data.value.summary.price_count, {
                  one: "1 precio",
                  other: `${data.value.summary.price_count} precios`,
                })}
              />
            ) : (
              <FigureStat size="heading" label="Precios" loading />
            )}
          </Card>
        </div>
      )}
      <Table
        aria-label="Precios sin revisar"
        table={table}
        {...cloudTableState(data, "los precios sin revisar")}
        empty={{
          icon: <TagX />,
          title: "No hay precios sin revisar en este período",
          variant: filters.from === "" ? "blank" : "filtered",
        }}
      />
    </ScreenLayout>
  );
}
