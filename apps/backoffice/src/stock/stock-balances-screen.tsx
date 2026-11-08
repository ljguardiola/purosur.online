import type {
  StockBalance,
  StockBalanceList,
  StockCountResult,
  StockMovementResult,
  StockProduct,
} from "@purosur/contracts";
import {
  actionsColumn,
  Card,
  dataColumn,
  FigureStat,
  FloatingNotification,
  formatNumber,
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
import { formatProductDescription } from "@purosur/ui/formatters";
import { deepEqual } from "@tanstack/react-router";
import { Check, Package, Search } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { ProductCreationModal } from "../platform/creation-parts";
import { formatStockQuantity } from "../platform/stock-quantity";
import {
  type BackofficeAccess,
  canManageProductsAndCategories,
  canSeeStockBalances,
} from "../shell/backoffice-access";
import { ReportDownload } from "../shell/report-download";
import { reportFileName } from "../shell/report-file-name";
import { countMomentNow } from "./count-moment";
import { NewCountModal } from "./new-count-modal";
import { OpenStockBalancePanel } from "./open-stock-balance-panel";
import type { StockBalancesFilters } from "./routes";
import { stockBalanceRowActions } from "./stock-balance-row-actions";
import type { StockBalancesScreenServices } from "./stock-balances-services";
import { stockBalancesSpreadsheet } from "./stock-balances-spreadsheet";
import { formatStockUnitCost, formatStockValue } from "./stock-cost";
import type { MovementKind } from "./stock-movement-form";
import { StockMovementModal } from "./stock-movement-modal";
import { useRefreshStock, useStockBalancesQuery } from "./stock-queries";
import { countRegisteredNotice, movementRegisteredNotice } from "./stock-registered-notices";
import { categoryFilterOptions } from "./stock-screen-parts";

export type StockBalancesScreenProps = {
  access: BackofficeAccess;
  productCreationModal: ProductCreationModal;
  filters: StockBalancesFilters;
  onFiltersChange: (filters: StockBalancesFilters) => void;
  openProduct?: string | undefined;
  onOpenProductChange: (product: string | undefined) => void;
  onSessionEnded: () => void;
  services: StockBalancesScreenServices;
  now?: () => Date;
};

type RowAction =
  | { kind: "count"; productId: string; start: ReturnType<typeof countMomentNow> }
  | { kind: "movement"; productId: string; movement: MovementKind };

type ScreenNotice = { id: number; title: string; description: string };

const MOVEMENT_TITLES = { adjustment: "Cargar ajuste", loss: "Cargar pérdida" } as const;

type BalanceFilter = StockBalancesFilters["balance"];
type BalanceSortColumn = StockBalancesFilters["sortBy"];

const CORRECTION_NOTES = {
  count: "Saldo negativo · se corrige con un recuento",
  purchase_or_count: "Sin lotes · se corrige con una compra o un recuento",
} as const;

const productOrder = textOrder((product: StockBalance) => formatProductDescription(product));

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

function coverageText({ productCount, withoutCostCount }: StockBalanceList["summary"]) {
  const products = plural(productCount, {
    one: "1 producto con movimiento",
    other: `${formatNumber(productCount)} productos con movimiento`,
  });
  return withoutCostCount === 0
    ? products
    : `${products} · ${formatNumber(withoutCostCount)} sin costo`;
}

function StockValueSummary({ list }: { list: StockBalanceList | undefined }) {
  return (
    <Card>
      {list === undefined ? (
        <FigureStat size="heading" label="Valorizado a costo" loading />
      ) : (
        <>
          <FigureStat
            size="heading"
            label="Valorizado a costo"
            value={formatSignedCents(list.summary.valueCents)}
          />
          <p className="text-detail text-text-subtle">{coverageText(list.summary)}</p>
        </>
      )}
    </Card>
  );
}

export function StockBalancesScreen({
  access,
  productCreationModal,
  filters,
  onFiltersChange,
  openProduct,
  onOpenProductChange,
  onSessionEnded,
  services,
  now,
}: StockBalancesScreenProps) {
  const clock = now ?? (() => new Date());
  const [search, setSearch] = useState(filters.search);
  const [category, setCategory] = useState(filters.category);
  const [balance, setBalance] = useState<BalanceFilter>(filters.balance);
  const [sort, setSort] = useState<TableSort<BalanceSortColumn>>({
    column: filters.sortBy,
    direction: filters.sort,
  });
  const [rowAction, setRowAction] = useState<RowAction | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);
  const reportFilters = useEffectEvent(onFiltersChange);
  const refreshStock = useRefreshStock();
  const showsBalance = canSeeStockBalances(access);

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
            {formatProductDescription(item)}
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
      ...stockBalanceRowActions(access, {
        count: (product) => {
          setNotice(null);
          setRowAction({ kind: "count", productId: product.id, start: countMomentNow(clock()) });
        },
        adjust: (product) => {
          setNotice(null);
          setRowAction({ kind: "movement", productId: product.id, movement: "adjustment" });
        },
        registerLoss: (product) => {
          setNotice(null);
          setRowAction({ kind: "movement", productId: product.id, movement: "loss" });
        },
      }),
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
    search: { text: search, in: (product) => [formatProductDescription(product)] },
    filter: (product) =>
      (category === "ALL" || product.categoryId === category) &&
      matchesBalance(product.balance, balance),
    columns,
    sort,
    onSortChange: setSort,
  });

  // A fresh id for each notice, so a screen reader announces a notice with the same text again.
  function showNotice(shown: Omit<ScreenNotice, "id">) {
    lastNoticeId.current += 1;
    setNotice({ ...shown, id: lastNoticeId.current });
  }

  function handleCountRegistered(product: StockProduct, result: StockCountResult) {
    setRowAction(null);
    void refreshStock();
    showNotice(countRegisteredNotice(product, result, showsBalance));
  }

  function handleMovementRegistered(
    product: StockProduct,
    result: StockMovementResult,
    delta: number,
  ) {
    setRowAction(null);
    void refreshStock();
    showNotice(movementRegisteredNotice(product, result, delta, showsBalance));
  }

  const creation = canManageProductsAndCategories(access) ? { productCreationModal } : {};

  return (
    <>
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-6">
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
              searchable
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
            <div className="ml-auto">
              <ReportDownload
                dataStatus={data.status}
                workbook={() =>
                  data.status === "loaded"
                    ? stockBalancesSpreadsheet(
                        data.value.summary,
                        table.getPrePaginatedRowModel().rows.map((row) => row.original),
                      )
                    : null
                }
                fileName={reportFileName("Stock valorizado")}
              />
            </div>
          </div>
          {data.status === "failed" ? null : (
            <div>
              <StockValueSummary list={data.status === "loaded" ? data.value : undefined} />
            </div>
          )}
          <Table
            aria-label="Saldos"
            table={table}
            onRowPress={(item) => onOpenProductChange(item.id)}
            rowState={(item) =>
              item.id === openProduct ? "selected" : item.correction === null ? undefined : "error"
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
          />
        </div>
        <OpenStockBalancePanel
          products={products}
          productsAreLoaded={data.status === "loaded" && !data.refreshing}
          openProduct={openProduct}
          access={access}
          services={services}
          onClose={() => onOpenProductChange(undefined)}
          onSessionEnded={onSessionEnded}
        />
      </div>
      {rowAction?.kind === "count" ? (
        <NewCountModal
          startMoment={rowAction.start}
          productId={rowAction.productId}
          showsBalance={showsBalance}
          {...creation}
          services={services}
          onClose={() => setRowAction(null)}
          onSessionEnded={onSessionEnded}
          onRegistered={handleCountRegistered}
        />
      ) : null}
      {rowAction?.kind === "movement" ? (
        <StockMovementModal
          title={MOVEMENT_TITLES[rowAction.movement]}
          kinds={[rowAction.movement]}
          productId={rowAction.productId}
          showsBalance={showsBalance}
          {...creation}
          services={services}
          onClose={() => setRowAction(null)}
          onSessionEnded={onSessionEnded}
          onRegistered={handleMovementRegistered}
        />
      ) : null}
      {notice ? (
        <FloatingNotification
          key={notice.id}
          tone="success"
          icon={<Check />}
          title={notice.title}
          description={notice.description}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
    </>
  );
}
