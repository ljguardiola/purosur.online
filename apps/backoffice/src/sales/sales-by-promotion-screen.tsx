import type { SalesByPromotionBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  plural,
  Table,
  TableCellText,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { BadgePercent } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import {
  discountBenefitText,
  discountTargetLine,
  weekdaysText,
} from "../platform/discount-terms-text";
import { ReportFilters } from "../shell/report-filters";
import { reportQueryOf } from "../shell/report-filters-search";
import type { ReportRegisterField } from "../shell/report-register-field";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { SalesByPromotionFilters } from "./sales-by-promotion-filters";
import type { SalesByPromotionScreenServices } from "./sales-by-promotion-services";
import { useSalesByPromotionQuery } from "./sales-queries";
import { soldQuantityText } from "./sold-quantity-text";

export type SalesByPromotionScreenProps = {
  filters: SalesByPromotionFilters;
  onFiltersChange: (filters: SalesByPromotionFilters) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: SalesByPromotionScreenServices;
};

type PromotionRow = SalesByPromotionBody["rows"][number];

const NO_ROWS: PromotionRow[] = [];

const UNKNOWN_PROMOTION = "Promoción desconocida";
const NO_FIGURE = "—";
const EVERY_WEEKDAY = 7;

function promotionName(name: string | null): string {
  return name ?? UNKNOWN_PROMOTION;
}

function termsText({ terms }: PromotionRow): string | null {
  if (terms === null) {
    return null;
  }
  const weekdays =
    terms.weekdays.length === 0 || terms.weekdays.length === EVERY_WEEKDAY
      ? []
      : [weekdaysText(terms.weekdays)];
  return [discountTargetLine(terms.target), discountBenefitText(terms.benefit), ...weekdays].join(
    " · ",
  );
}

const promotionColumns = [
  dataColumn({
    id: "name",
    header: "Promoción",
    sort: {
      order: textOrder((row: PromotionRow) => promotionName(row.name)),
      firstDirection: "ascending",
    },
    render: (row: PromotionRow) => (
      <div className="flex flex-col">
        <span>{promotionName(row.name)}</span>
        {termsText(row) === null ? null : (
          <span className="text-text-subtle text-detail">{termsText(row)}</span>
        )}
      </div>
    ),
  }),
  dataColumn({
    id: "lines",
    header: "Líneas",
    align: "end",
    sort: { order: (a, b) => a.lines - b.lines, firstDirection: "descending" },
    render: (row: PromotionRow) => formatNumber(row.lines),
  }),
  dataColumn({
    id: "units",
    header: "Unidades",
    align: "end",
    sort: {
      order: (a, b) => a.units - b.units || a.thousandths - b.thousandths,
      firstDirection: "descending",
    },
    render: (row: PromotionRow) => soldQuantityText(row),
  }),
  dataColumn({
    id: "discounted",
    header: "Descontado",
    align: "end",
    sort: { order: (a, b) => a.discounted - b.discounted, firstDirection: "descending" },
    render: (row: PromotionRow) => (
      <TableCellText strong>{formatCents(row.discounted)}</TableCellText>
    ),
  }),
] as const;

export function SalesByPromotionScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: SalesByPromotionScreenProps) {
  const registerChosen = filters.register !== "ALL";
  const data = useSalesByPromotionQuery({
    query: reportQueryOf(filters),
    fetchSalesByPromotion: services.fetchSalesByPromotion,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.rows ?? NO_ROWS,
    id: (row) => row.promotion_id,
    columns: promotionColumns,
    sort: { column: filters.sortBy, direction: filters.sort },
    onSortChange: ({ column, direction }) =>
      onFiltersChange({ ...filters, sortBy: column, sort: direction }),
  });
  const mostUsed = shown?.totals.most_used ?? null;

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Ventas" title="Descuentos por promoción" />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          answeredPeriod={shown?.range}
          registerFilter={registerFilter}
        />
      </div>
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-3 gap-4">
          {shown ? (
            <>
              <Card>
                <FigureStat
                  size="heading"
                  label="Descontado"
                  value={formatCents(shown.totals.discounted)}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Líneas con promoción"
                  value={formatNumber(shown.totals.lines)}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Más usada"
                  value={mostUsed === null ? NO_FIGURE : promotionName(mostUsed.name)}
                  {...(mostUsed === null
                    ? {}
                    : {
                        detail: plural(mostUsed.lines, {
                          one: "1 línea",
                          other: `${formatNumber(mostUsed.lines)} líneas`,
                        }),
                      })}
                />
              </Card>
            </>
          ) : (
            <>
              <Card>
                <FigureStat size="heading" label="Descontado" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Líneas con promoción" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Más usada" loading />
              </Card>
            </>
          )}
        </div>
      )}
      <Table
        aria-label="Descuentos por promoción"
        table={table}
        {...cloudTableState(data, "el reporte de descuentos por promoción")}
        empty={{
          icon: <BadgePercent />,
          title: registerChosen
            ? "No hay descuentos de esta caja en este período"
            : "No hay descuentos en este período",
          variant: registerChosen ? "filtered" : "blank",
        }}
      />
    </ScreenLayout>
  );
}
