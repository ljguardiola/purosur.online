import { type CurrentStockReportBody, currentStockReportQuerySchema } from "@purosur/contracts";
import {
  actionsColumn,
  Card,
  dataColumn,
  FigureStat,
  formatSignedCents,
  type ItemOrder,
  ListFilter,
  PercentBar,
  plural,
  Table,
  TableCellText,
  Tag,
  useTableModel,
} from "@purosur/ui";
import { ChevronDown, ChevronUp, Package } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { shareOfTotal } from "../platform/share-of-total";
import { formatStockQuantity } from "../platform/stock-quantity";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import type { CurrentStockReportFilters } from "./current-stock-report-filters";
import { CurrentStockReportLots } from "./current-stock-report-lots";
import type { CurrentStockReportScreenServices } from "./current-stock-report-services";
import { formatStockValue } from "./stock-cost";
import { useCurrentStockReportQuery } from "./stock-queries";

export type CurrentStockReportScreenProps = {
  filters: CurrentStockReportFilters;
  onFiltersChange: (filters: CurrentStockReportFilters) => void;
  onSessionEnded: () => void;
  services: CurrentStockReportScreenServices;
};

type Product = CurrentStockReportBody["products"][number];

const NO_PRODUCTS: Product[] = [];

const ALL_CATEGORIES = "ALL";

function numberOrder(value: (product: Product) => number | null): ItemOrder<Product> {
  return (a, b) => (value(a) ?? Number.NEGATIVE_INFINITY) - (value(b) ?? Number.NEGATIVE_INFINITY);
}

function figureTone(amount: number | null) {
  if (amount === null) {
    return "subtle";
  }
  return amount < 0 ? "error" : undefined;
}

function productsText(count: number): string {
  return plural(count, { one: "1 producto", other: `${count} productos` });
}

function ShareOfTotal({ product, total }: { product: Product; total: number }) {
  const value = product.value_cents;
  if (value === null || value <= 0 || total <= 0) {
    return <TableCellText tone="subtle">—</TableCellText>;
  }
  return <PercentBar value={shareOfTotal(value, total)} />;
}

function SummaryCards({ report }: { report: CurrentStockReportBody | undefined }) {
  if (report === undefined) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {["Valorizado a costo", "Con saldo negativo", "Sin costo"].map((label) => (
          <Card key={label}>
            <FigureStat size="heading" label={label} loading />
          </Card>
        ))}
      </div>
    );
  }
  const { summary } = report;
  return (
    <div className="grid grid-cols-3 gap-4">
      <Card>
        <FigureStat
          size="heading"
          label="Valorizado a costo"
          value={formatSignedCents(summary.value_cents)}
        />
        <p className="text-detail text-text-subtle">{productsText(summary.product_count)}</p>
      </Card>
      <Card>
        <FigureStat
          size="heading"
          label="Con saldo negativo"
          value={productsText(summary.negative_balance_count)}
        />
        {summary.negative_balance_count === 0 ? null : <Tag tone="warning">Revisar saldos</Tag>}
      </Card>
      <Card>
        <FigureStat
          size="heading"
          label="Sin costo"
          value={productsText(summary.without_cost_count)}
        />
        {summary.without_cost_count === 0 ? null : <Tag tone="warning">No suman al valorizado</Tag>}
      </Card>
    </div>
  );
}

export function CurrentStockReportScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: CurrentStockReportScreenProps) {
  const [opened, setOpened] = useState<readonly string[]>([]);
  const reportFilters = useEffectEvent(onFiltersChange);
  const data = useCurrentStockReportQuery({
    query: currentStockReportQuerySchema.catch({}).parse({
      ...(filters.category === ALL_CATEGORIES ? {} : { category_id: filters.category }),
    }),
    fetchCurrentStockReport: services.fetchCurrentStockReport,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const categoryOptions = [
    { value: ALL_CATEGORIES, label: "Todas" },
    ...(shown?.categories ?? []).map(({ id, name }) => ({ value: id, label: name })),
  ] as [{ value: string; label: string }, ...{ value: string; label: string }[]];
  const categoryIsOffered = categoryOptions.some(({ value }) => value === filters.category);

  useEffect(() => {
    if (data.status === "loaded" && !categoryIsOffered) {
      reportFilters({ ...filters, category: ALL_CATEGORIES });
    }
  }, [data.status, categoryIsOffered, filters]);

  const total = shown?.summary.value_cents ?? 0;
  const columns = [
    dataColumn({
      id: "product",
      header: "Producto",
      sort: {
        order: (a: Product, b: Product) => a.name.localeCompare(b.name, "es"),
        firstDirection: "ascending",
      },
      render: (item: Product) => (
        <TableCellText description={item.category_name}>{item.name}</TableCellText>
      ),
    }),
    dataColumn({
      id: "lots",
      width: 110,
      header: "Lotes",
      align: "end",
      sort: { order: numberOrder((item) => item.lots.length), firstDirection: "descending" },
      render: (item: Product) => <TableCellText tone="subtle">{item.lots.length}</TableCellText>,
    }),
    dataColumn({
      id: "balance",
      width: 150,
      header: "Saldo",
      align: "end",
      sort: { order: numberOrder((item) => item.balance), firstDirection: "descending" },
      render: (item: Product) => (
        <TableCellText strong tone={figureTone(item.balance)}>
          {formatStockQuantity(item.balance, item.sale_unit)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "value",
      width: 170,
      header: "Valorizado",
      align: "end",
      sort: { order: numberOrder((item) => item.value_cents), firstDirection: "descending" },
      render: (item: Product) => (
        <TableCellText strong tone={figureTone(item.value_cents)}>
          {formatStockValue(item.value_cents)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "share",
      header: "Parte del total",
      render: (item: Product) => <ShareOfTotal product={item} total={total} />,
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones del producto",
      actions: [
        (item: Product) =>
          item.lots.length === 0
            ? undefined
            : opened.includes(item.id)
              ? {
                  icon: <ChevronUp />,
                  "aria-label": `Ocultar los lotes de ${item.name}`,
                  onPress: () => setOpened(opened.filter((id) => id !== item.id)),
                }
              : {
                  icon: <ChevronDown />,
                  "aria-label": `Ver los lotes de ${item.name}`,
                  onPress: () => setOpened([...opened, item.id]),
                },
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: shown?.products ?? NO_PRODUCTS,
    id: (product) => product.id,
    columns,
    sort: { column: filters.sortBy, direction: filters.sort },
    onSortChange: ({ column, direction }) =>
      onFiltersChange({ ...filters, sortBy: column, sort: direction }),
  });

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Stock" title="Stock actual valorizado" />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ListFilter
          name="category"
          label="Categoría:"
          options={categoryOptions}
          value={categoryIsOffered ? filters.category : ALL_CATEGORIES}
          onChange={(category) => onFiltersChange({ ...filters, category })}
        />
      </div>
      {data.status === "failed" ? null : <SummaryCards report={shown} />}
      <Table
        aria-label="Stock actual valorizado"
        table={table}
        rowState={(item) => (opened.includes(item.id) ? "selected" : undefined)}
        rowDetail={(item) =>
          opened.includes(item.id) ? <CurrentStockReportLots product={item} /> : undefined
        }
        {...cloudTableState(data, "el stock actual")}
        empty={{
          icon: <Package />,
          title: "No hay productos con stock",
          variant: filters.category === ALL_CATEGORIES ? "blank" : "filtered",
        }}
      />
    </ScreenLayout>
  );
}
