import type { StockBalance, StockBalanceList } from "@purosur/contracts";
import {
  actionsColumn,
  dataColumn,
  formatSignedCents,
  type ItemOrder,
  ListFilter,
  plural,
  SearchField,
  Table,
  TableCellText,
  type TableSort,
  Tag,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Package, Search } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatStockQuantity } from "../platform/stock-quantity";
import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import type { StockBalancesFilters } from "./routes";
import { StockBalanceLots } from "./stock-balance-lots";
import type { StockBalancesScreenServices } from "./stock-balances-services";
import { formatStockUnitCost, formatStockValue } from "./stock-cost";
import { useStockBalancesQuery } from "./stock-queries";
import { categoryFilterOptions } from "./stock-screen-parts";

export type StockBalancesScreenProps = {
  filters: StockBalancesFilters;
  onFiltersChange: (filters: StockBalancesFilters) => void;
  onSessionEnded: () => void;
  services: StockBalancesScreenServices;
};

type BalanceFilter = StockBalancesFilters["balance"];
type BalanceSortColumn = StockBalancesFilters["sortBy"];

const CORRECTION_NOTES = {
  count: "Saldo negativo · se corrige con un recuento",
  purchase_or_count: "Sin lotes · se corrige con una compra o un recuento",
} as const;

const productOrder = textOrder((product: StockBalance) => product.name);

function numberOrder(value: (product: StockBalance) => number | null): ItemOrder<StockBalance> {
  return (a, b) => (value(a) ?? Number.NEGATIVE_INFINITY) - (value(b) ?? Number.NEGATIVE_INFINITY);
}

function figureTone(amount: number | null, otherwise: "subtle" | undefined) {
  if (amount === null) {
    return "subtle";
  }
  return amount < 0 ? "error" : otherwise;
}

const NO_PRODUCTS: StockBalance[] = [];

const BALANCE_FILTER_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "positive", label: "Con saldo" },
  { value: "zero", label: "Sin saldo" },
  { value: "negative", label: "Negativo" },
] as const satisfies readonly { value: BalanceFilter; label: string }[];

function matchesBalance(balance: number, filter: BalanceFilter): boolean {
  if (filter === "positive") {
    return balance > 0;
  }
  if (filter === "zero") {
    return balance === 0;
  }
  if (filter === "negative") {
    return balance < 0;
  }
  return true;
}

function summaryText({ productCount, valueCents, withoutCostCount }: StockBalanceList["summary"]) {
  const products = plural(productCount, {
    one: "1 producto con movimiento",
    other: `${productCount} productos con movimiento`,
  });
  const value = `valorizado ${formatSignedCents(valueCents)}`;
  return withoutCostCount === 0
    ? `${products} · ${value}`
    : `${products} · ${value} · ${withoutCostCount} sin costo`;
}

export function StockBalancesScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: StockBalancesScreenProps) {
  const [search, setSearch] = useState(filters.search);
  const [category, setCategory] = useState(filters.category);
  const [balance, setBalance] = useState<BalanceFilter>(filters.balance);
  const [sort, setSort] = useState<TableSort<BalanceSortColumn>>({
    column: filters.sortBy,
    direction: filters.sort,
  });
  const [opened, setOpened] = useState<readonly string[]>([]);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: StockBalancesFilters = {
      search,
      category,
      balance,
      sortBy: sort.column,
      sort: sort.direction,
    };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, category, balance, sort.column, sort.direction, filters]);

  const columns = [
    dataColumn({
      id: "product",
      header: "Producto",
      sort: { order: productOrder, firstDirection: "ascending" },
      render: (item: StockBalance) => (
        <div className="flex items-center gap-2">
          <TableCellText
            description={
              item.correction === null ? item.categoryName : CORRECTION_NOTES[item.correction]
            }
            descriptionTone={item.correction === null ? undefined : "error"}
          >
            {item.name}
          </TableCellText>
          {item.active ? null : <Tag tone="neutral">Desactivado</Tag>}
        </div>
      ),
    }),
    dataColumn({
      id: "balance",
      width: 150,
      header: "Saldo",
      align: "end",
      sort: { order: numberOrder((item) => item.balance), firstDirection: "descending" },
      render: (item: StockBalance) => (
        <TableCellText strong tone={figureTone(item.balance, undefined)}>
          {formatStockQuantity(item.balance, item.saleUnit)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "unitCost",
      width: 160,
      header: "Costo unitario",
      align: "end",
      sort: { order: numberOrder((item) => item.unitCostCents), firstDirection: "descending" },
      render: (item: StockBalance) => (
        <TableCellText tone="subtle">
          {formatStockUnitCost(item.unitCostCents, item.saleUnit)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "value",
      width: 170,
      header: "Valorizado",
      align: "end",
      sort: { order: numberOrder((item) => item.valueCents), firstDirection: "descending" },
      render: (item: StockBalance) => (
        <TableCellText strong tone={figureTone(item.valueCents, undefined)}>
          {formatStockValue(item.valueCents)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "lots",
      width: 110,
      header: "Lotes",
      align: "end",
      sort: { order: numberOrder((item) => item.lotCount), firstDirection: "descending" },
      render: (item: StockBalance) => <TableCellText tone="subtle">{item.lotCount}</TableCellText>,
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones del saldo",
      actions: [
        (item: StockBalance) =>
          item.lotCount === 0
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

  const data = useStockBalancesQuery({
    fetchStockBalances: services.fetchStockBalances,
    onSessionEnded,
  });
  const products = data.status === "loaded" ? data.value.products : NO_PRODUCTS;
  const categoryOptions = categoryFilterOptions(products);
  const categoryIsOffered = categoryOptions.some((option) => option.value === category);

  useEffect(() => {
    if (data.status === "loaded" && !categoryIsOffered) {
      setCategory("ALL");
    }
  }, [data.status, categoryIsOffered]);

  const table = useTableModel({
    items: products,
    id: (product) => product.id,
    search: { text: search, in: (product) => [product.name] },
    filter: (product) =>
      (category === "ALL" || product.categoryId === category) &&
      matchesBalance(product.balance, balance),
    columns,
    sort,
    onSortChange: setSort,
  });

  return (
    <ScreenLayout topBar={<AreaTopBar eyebrow="Stock" title="Saldos" />} bodyClassName="gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-105">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar un producto"
            icon={<Search />}
          />
        </div>
        <ListFilter
          name="category"
          label="Categoría:"
          options={categoryOptions}
          value={categoryIsOffered ? category : "ALL"}
          onChange={setCategory}
        />
        <ListFilter
          name="balance"
          label="Saldo:"
          options={BALANCE_FILTER_OPTIONS}
          value={balance}
          onChange={setBalance}
        />
      </div>
      <Table
        aria-label="Saldos"
        table={table}
        rowState={(item) =>
          opened.includes(item.id) ? "selected" : item.correction === null ? undefined : "error"
        }
        rowDetail={(item) =>
          opened.includes(item.id) ? <StockBalanceLots product={item} /> : undefined
        }
        {...cloudTableState(data, "los saldos")}
        empty={
          products.length === 0
            ? {
                icon: <Package />,
                title: "No hay productos activos",
                description: "Creá uno en Productos para llevar su stock.",
                variant: "blank",
              }
            : {
                icon: <Search />,
                title: "Sin resultados",
                description: "Probá con otro nombre, categoría o saldo.",
                variant: "filtered",
              }
        }
        footer={
          data.status === "loaded" ? (
            <p className="text-text-subtle text-detail">{summaryText(data.value.summary)}</p>
          ) : undefined
        }
      />
    </ScreenLayout>
  );
}
