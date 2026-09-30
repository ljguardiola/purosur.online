import type { StockBalance } from "@purosur/contracts";
import { ListFilter, plural, SearchField, Table, TableCellText, tableRows } from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Package, Search } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import type { StockBalancesFilters } from "./routes";
import type { StockBalancesScreenServices } from "./stock-balances-services";
import { formatStockQuantity } from "./stock-quantity";
import { useStockBalancesQuery } from "./stock-queries";
import { categoryFilterOptions, StockTopBar } from "./stock-screen-parts";

export type StockBalancesScreenProps = {
  filters: StockBalancesFilters;
  onFiltersChange: (filters: StockBalancesFilters) => void;
  onSessionEnded: () => void;
  services: StockBalancesScreenServices;
};

type BalanceFilter = StockBalancesFilters["balance"];

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

const columns = [
  {
    key: "product",
    header: "Producto",
    render: (item: StockBalance) => (
      <TableCellText description={item.categoryName}>{item.name}</TableCellText>
    ),
  },
  {
    key: "balance",
    header: "Saldo",
    align: "end" as const,
    render: (item: StockBalance) => formatStockQuantity(item.balance, item.saleUnit),
  },
] as const;

export function StockBalancesScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: StockBalancesScreenProps) {
  const [search, setSearch] = useState(filters.search);
  const [category, setCategory] = useState(filters.category);
  const [balance, setBalance] = useState<BalanceFilter>(filters.balance);
  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: StockBalancesFilters = { search, category, balance };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, category, balance, filters]);

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

  const { rows, matchCount } = tableRows({
    items: products,
    id: (product) => product.id,
    search: { text: search, in: (product) => [product.name] },
    filter: (product) =>
      (category === "ALL" || product.categoryId === category) &&
      matchesBalance(product.balance, balance),
  });

  return (
    <ScreenLayout topBar={<StockTopBar title="Saldos" />} bodyClassName="gap-4 p-6">
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
          label="Categoría:"
          options={categoryOptions}
          value={categoryIsOffered ? category : "ALL"}
          onChange={setCategory}
        />
        <ListFilter
          label="Saldo:"
          options={BALANCE_FILTER_OPTIONS}
          value={balance}
          onChange={setBalance}
        />
      </div>
      <Table
        aria-label="Saldos"
        columns={columns}
        {...cloudTableState(data, "los saldos")}
        rows={rows}
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
          matchCount === 0 ? undefined : (
            <p className="text-text-subtle text-detail">
              {plural(matchCount, { one: "1 producto", other: `${matchCount} productos` })}
            </p>
          )
        }
      />
    </ScreenLayout>
  );
}
