import type { StockCount, StockCountResult, StockProduct } from "@purosur/contracts";
import {
  Button,
  FloatingNotification,
  ListFilter,
  plural,
  SearchField,
  Table,
  TableCellText,
  Tag,
  tableRows,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { Check, ClipboardCheck, Plus, Search } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { type BackofficeAccess, canSeeStockBalances } from "../access/backoffice-access";
import { cloudTableState } from "../platform/cloud-table-state";
import { ScreenLayout } from "../shell/screen-layout";
import { countMomentNow } from "./count-moment";
import { NewCountModal } from "./new-count-modal";
import type { StockCountsFilters } from "./routes";
import type { StockCountsScreenServices } from "./stock-counts-services";
import {
  formatStockDay,
  formatStockTime,
  periodDays,
  STOCK_PERIOD_OPTIONS,
  type StockPeriod,
} from "./stock-period";
import { formatStockChange, formatStockQuantity } from "./stock-quantity";
import { useRefreshStock, useStockCountsQuery } from "./stock-queries";
import { categoryFilterOptions, StockTopBar } from "./stock-screen-parts";

export type StockCountsScreenProps = {
  access: BackofficeAccess;
  filters: StockCountsFilters;
  onFiltersChange: (filters: StockCountsFilters) => void;
  onSessionEnded: () => void;
  services: StockCountsScreenServices;
  now?: () => Date;
};

type ScreenNotice = { id: number; title: string; description: string };

const NO_COUNTS: StockCount[] = [];

function differenceCell(count: StockCount) {
  const difference =
    count.delta === 0 ? "Sin diferencia" : formatStockChange(count.delta, count.saleUnit);
  return count.superseded ? (
    <div className="flex flex-col items-end gap-1">
      <span>{difference}</span>
      <Tag tone="neutral">Superado por un recuento posterior</Tag>
    </div>
  ) : (
    difference
  );
}

const columns = [
  {
    key: "date",
    header: "Fecha",
    render: (count: StockCount) => (
      <TableCellText description={formatStockTime(count.occurredAt)}>
        {formatStockDay(count.occurredAt)}
      </TableCellText>
    ),
  },
  {
    key: "product",
    header: "Producto",
    render: (count: StockCount) => (
      <TableCellText description={count.categoryName}>{count.productName}</TableCellText>
    ),
  },
  {
    key: "expected",
    header: "Saldo esperado",
    align: "end" as const,
    render: (count: StockCount) => formatStockQuantity(count.expected, count.saleUnit),
  },
  {
    key: "counted",
    header: "Contado",
    align: "end" as const,
    render: (count: StockCount) => formatStockQuantity(count.counted, count.saleUnit),
  },
  {
    key: "difference",
    header: "Diferencia",
    align: "end" as const,
    render: differenceCell,
  },
] as const;

function registeredNotice(product: StockProduct, result: StockCountResult, showsBalance: boolean) {
  const balance = formatStockQuantity(result.balance, product.saleUnit);
  if (result.superseded) {
    return {
      title: "El recuento no cambió el saldo",
      description: showsBalance
        ? `Hay un recuento posterior de ${product.name}: el saldo sigue en ${balance}.`
        : `Hay un recuento posterior de ${product.name}.`,
    };
  }
  if (result.delta === 0) {
    return {
      title: "Sin diferencia",
      description: showsBalance
        ? `${product.name} sigue en ${balance}.`
        : `${product.name} sigue igual.`,
    };
  }
  return {
    title: "Saldo corregido",
    description: showsBalance
      ? `${product.name} queda en ${balance}.`
      : `${product.name}: ${formatStockChange(result.delta, product.saleUnit)}.`,
  };
}

export function StockCountsScreen({
  access,
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
  now,
}: StockCountsScreenProps) {
  const clock = now ?? (() => new Date());
  const showsBalance = canSeeStockBalances(access);
  const [search, setSearch] = useState(filters.search);
  const [category, setCategory] = useState(filters.category);
  const [period, setPeriod] = useState<StockPeriod>(filters.period);
  const [newCount, setNewCount] = useState<ReturnType<typeof countMomentNow> | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);
  const reportFilters = useEffectEvent(onFiltersChange);
  const refreshStock = useRefreshStock();

  useEffect(() => {
    const shown: StockCountsFilters = { search, category, period };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, category, period, filters]);

  const days = periodDays(period);
  const data = useStockCountsQuery({
    days,
    fetchStockCounts: services.fetchStockCounts,
    onSessionEnded,
  });
  const counts = data.status === "loaded" ? data.value.counts : NO_COUNTS;
  const categoryOptions = categoryFilterOptions(counts);
  const categoryIsOffered = categoryOptions.some((option) => option.value === category);
  const listIsFresh = data.status === "loaded" && !data.refreshing;

  useEffect(() => {
    if (listIsFresh && !categoryIsOffered) {
      setCategory("ALL");
    }
  }, [listIsFresh, categoryIsOffered]);

  const { rows, matchCount } = tableRows({
    items: counts,
    id: (count) => count.id,
    search: { text: search, in: (count) => [count.productName] },
    filter: (count) => category === "ALL" || count.categoryId === category,
  });

  // A fresh id for each notice, so a screen reader announces a notice with the same text again.
  function showNotice(shown: Omit<ScreenNotice, "id">) {
    lastNoticeId.current += 1;
    setNotice({ ...shown, id: lastNoticeId.current });
  }

  function handleRegistered(product: StockProduct, result: StockCountResult) {
    setNewCount(null);
    void refreshStock();
    showNotice(registeredNotice(product, result, showsBalance));
  }

  return (
    <>
      <ScreenLayout
        topBar={
          <StockTopBar
            title="Recuentos"
            action={
              <Button
                variant="primary"
                icon={<Plus />}
                onPress={() => {
                  setNotice(null);
                  setNewCount(countMomentNow(clock()));
                }}
              >
                Nuevo recuento
              </Button>
            }
          />
        }
        bodyClassName="gap-4 p-6"
      >
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
            label="Período:"
            options={STOCK_PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
          />
        </div>
        <Table
          aria-label="Recuentos"
          columns={columns}
          {...cloudTableState(data, "los recuentos")}
          rows={rows}
          empty={
            counts.length === 0
              ? {
                  icon: <ClipboardCheck />,
                  title: `Sin recuentos en los últimos ${days} días`,
                  description: "Un recuento corrige el saldo con lo que hay en el local.",
                  variant: "blank",
                }
              : {
                  icon: <Search />,
                  title: "Sin resultados",
                  description: "Probá con otro nombre o categoría.",
                  variant: "filtered",
                }
          }
          footer={
            matchCount === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {plural(matchCount, {
                  one: `1 recuento en los últimos ${days} días`,
                  other: `${matchCount} recuentos en los últimos ${days} días`,
                })}
              </p>
            )
          }
        />
      </ScreenLayout>
      {newCount ? (
        <NewCountModal
          startMoment={newCount}
          showsBalance={showsBalance}
          services={services}
          onClose={() => setNewCount(null)}
          onSessionEnded={onSessionEnded}
          onRegistered={handleRegistered}
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
