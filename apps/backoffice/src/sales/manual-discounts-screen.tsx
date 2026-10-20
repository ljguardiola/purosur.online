import type { ManualDiscountsBody } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatCents,
  formatNumber,
  formatOperationNumber,
  plural,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { HandCoins } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ReportFilters } from "../shell/report-filters";
import type { ReportRegisterField } from "../shell/report-register-field";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { manualDiscountMoment } from "./manual-discount-moment";
import { ManualDiscountsAuthorizerFilter } from "./manual-discounts-authorizer-filter";
import { type ManualDiscountsFilters, manualDiscountsQueryOf } from "./manual-discounts-filters";
import type { ManualDiscountsScreenServices } from "./manual-discounts-services";
import { useManualDiscountsQuery } from "./sales-queries";

export type ManualDiscountsScreenProps = {
  filters: ManualDiscountsFilters;
  onFiltersChange: (filters: ManualDiscountsFilters) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: ManualDiscountsScreenServices;
};

type DiscountRow = ManualDiscountsBody["rows"][number];

const NO_ROWS: DiscountRow[] = [];

const UNIDENTIFIED = "Sin identificar";
const NO_FIGURE = "—";

function authorizerName(name: string | null): string {
  return name ?? UNIDENTIFIED;
}

function kindText({ kind, adjustment }: DiscountRow): string {
  if (adjustment.kind === "PRICE") {
    return "Precio nuevo";
  }
  const scope = kind === "SALE" ? "Sobre el total" : "De línea";
  const off =
    adjustment.kind === "PERCENT"
      ? `${formatNumber(adjustment.value)} %`
      : formatCents(adjustment.value);
  return `${scope} · ${off}`;
}

const discountColumns = [
  dataColumn({
    id: "moment",
    header: "Fecha",
    render: (row: DiscountRow) => {
      const { date, time } = manualDiscountMoment(row.completed_at);
      return <TableCellText description={time}>{date}</TableCellText>;
    },
  }),
  dataColumn({
    id: "sale",
    header: "Venta",
    render: (row: DiscountRow) => (
      <TableCellText description={row.product_name}>
        {row.operation_number === null
          ? NO_FIGURE
          : `Operación ${formatOperationNumber(row.operation_number)}`}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "kind",
    header: "Tipo",
    render: (row: DiscountRow) => kindText(row),
  }),
  dataColumn({
    id: "reason",
    header: "Motivo",
    render: (row: DiscountRow) => row.reason,
  }),
  dataColumn({
    id: "authorizer",
    header: "Autorizó",
    render: (row: DiscountRow) => authorizerName(row.authorizer.name),
  }),
  dataColumn({
    id: "discounted",
    header: "Descontado",
    align: "end",
    render: (row: DiscountRow) => (
      <TableCellText strong>{formatCents(row.discounted)}</TableCellText>
    ),
  }),
] as const;

export function ManualDiscountsScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: ManualDiscountsScreenProps) {
  const authorizerChosen = filters.authorizedBy !== "ALL";
  const filtered = filters.register !== "ALL" || authorizerChosen;
  const data = useManualDiscountsQuery({
    query: manualDiscountsQueryOf(filters),
    fetchManualDiscounts: services.fetchManualDiscounts,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const table = useTableModel({
    items: shown?.rows ?? NO_ROWS,
    id: (row) => (row.kind === "LINE" ? row.line_id : row.sale_id),
    columns: discountColumns,
  });
  const mostAuthorized = shown?.totals.most_authorized ?? null;

  return (
    <ScreenLayout
      topBar={
        <ScreenTopBar eyebrow="Reportes · Ventas" title="Descuentos manuales y sobre el total" />
      }
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          answeredPeriod={shown?.range}
          registerFilter={registerFilter}
        />
        <ManualDiscountsAuthorizerFilter
          value={filters.authorizedBy}
          authorizers={shown?.authorizers}
          onChange={(authorizedBy) => onFiltersChange({ ...filters, authorizedBy })}
        />
      </div>
      {data.status === "failed" ? null : (
        <div className={`grid gap-4 ${authorizerChosen ? "grid-cols-2" : "grid-cols-3"}`}>
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
                  label="Descuentos"
                  value={formatNumber(shown.totals.count)}
                  detail={`${formatNumber(shown.totals.line_count)} de línea · ${formatNumber(shown.totals.sale_count)} sobre el total`}
                />
              </Card>
              {authorizerChosen ? null : (
                <Card>
                  <FigureStat
                    size="heading"
                    label="Más autorizó"
                    value={
                      mostAuthorized === null ? NO_FIGURE : authorizerName(mostAuthorized.name)
                    }
                    {...(mostAuthorized === null
                      ? {}
                      : {
                          detail: plural(mostAuthorized.count, {
                            one: "1 descuento",
                            other: `${formatNumber(mostAuthorized.count)} descuentos`,
                          }),
                        })}
                  />
                </Card>
              )}
            </>
          ) : (
            <>
              <Card>
                <FigureStat size="heading" label="Descontado" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Descuentos" loading />
              </Card>
              {authorizerChosen ? null : (
                <Card>
                  <FigureStat size="heading" label="Más autorizó" loading />
                </Card>
              )}
            </>
          )}
        </div>
      )}
      <Table
        aria-label="Descuentos manuales y sobre el total"
        table={table}
        {...cloudTableState(data, "el reporte de descuentos manuales y sobre el total")}
        empty={{
          icon: <HandCoins />,
          title: filtered
            ? "No hay descuentos con estos filtros en este período"
            : "No hay descuentos en este período",
          variant: filtered ? "filtered" : "blank",
        }}
      />
    </ScreenLayout>
  );
}
