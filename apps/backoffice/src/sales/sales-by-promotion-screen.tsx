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
import { useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { AreaTopBar } from "../shell/area-top-bar";
import { RegisterReportDownload } from "../shell/report-download";
import { reportFileName } from "../shell/report-file-name";
import { ReportFilters } from "../shell/report-filters";
import { reportQueryOf } from "../shell/report-filters-search";
import type { ReportRegisterField } from "../shell/report-register-field";
import { ScreenLayout } from "../shell/screen-layout";
import { promotionTermsText } from "./promotion-terms-text";
import type { SalesByPromotionFilters } from "./sales-by-promotion-filters";
import type { SalesByPromotionScreenServices } from "./sales-by-promotion-services";
import { salesByPromotionSpreadsheet } from "./sales-by-promotion-spreadsheet";
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
const SCREEN_TITLE = "Descuentos por promoción";

function promotionName(name: string | null): string {
  return name ?? UNKNOWN_PROMOTION;
}

const promotionColumns = [
  dataColumn({
    id: "name",
    header: "Promoción",
    sort: {
      order: textOrder((row: PromotionRow) => promotionName(row.name)),
      firstDirection: "ascending",
    },
    render: (row: PromotionRow) => {
      const terms = promotionTermsText(row.terms);
      return (
        <div className="flex flex-col">
          <span>{promotionName(row.name)}</span>
          {terms === null ? null : <span className="text-text-subtle text-detail">{terms}</span>}
        </div>
      );
    },
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
    header: "Cantidad",
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
  const [registerLabel, setRegisterLabel] = useState<string>();
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
      topBar={<AreaTopBar eyebrow="Reportes · Ventas" title={SCREEN_TITLE} />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          answeredPeriod={shown?.range}
          registerFilter={registerFilter}
          onRegisterLabelChange={setRegisterLabel}
          trailing={
            <RegisterReportDownload
              dataStatus={data.status}
              registerLabel={registerLabel}
              workbook={(registerLabel) =>
                shown
                  ? salesByPromotionSpreadsheet(
                      shown,
                      table.getRowModel().rows.map((row) => row.original),
                      registerLabel,
                    )
                  : null
              }
              fileName={shown ? reportFileName(SCREEN_TITLE, shown.range) : ""}
            />
          }
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
