import type { ExpiredLotDiscardResult, ExpiringLot, ExpiringLotList } from "@purosur/contracts";
import {
  actionsColumn,
  dataColumn,
  FloatingNotification,
  formatCalendarDayNumeric,
  formatNumber,
  ListFilter,
  plural,
  SearchField,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { deepEqual } from "@tanstack/react-router";
import { CalendarClock, Check, Search, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { useRetryAdvice } from "../platform/action-failure-notice";
import { cloudTableState } from "../platform/cloud-table-state";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { formatStockQuantity } from "../platform/stock-quantity";
import { AreaTopBar } from "../shell/area-top-bar";
import { ScreenLayout } from "../shell/screen-layout";
import { expiryTiming } from "./expiring-lot-timing";
import type { ExpiringLotsScreenServices } from "./expiring-lots-services";
import type { ExpiringLotsFilters } from "./routes";
import type { DiscardExpiredLotOutcome } from "./stock-api";
import { formatStockValue } from "./stock-cost";
import { useExpiringLotsQuery, useRefreshStock } from "./stock-queries";
import { categoryFilterOptions } from "./stock-screen-parts";

export type ExpiringLotsScreenProps = {
  filters: ExpiringLotsFilters;
  onFiltersChange: (filters: ExpiringLotsFilters) => void;
  onSessionEnded: () => void;
  services: ExpiringLotsScreenServices;
};

type ExpiryFilter = ExpiringLotsFilters["expiry"];

type ScreenNotice = {
  tone: "success" | "error";
  title: string;
  description: string | null;
};

const NO_LOTS: ExpiringLot[] = [];

const REFUSAL_REASONS = {
  lot_not_expired: "El lote todavía no venció.",
  lot_empty: "El lote ya no tiene stock.",
  not_found: "El lote ya no existe.",
} as const;

function upcomingDays(windowDays: number): string {
  return windowDays === 0
    ? "hoy"
    : `en ${plural(windowDays, { one: "el próximo día", other: `los próximos ${windowDays} días` })}`;
}

function expiryFilterOptions(
  windowDays: number | undefined,
): [{ value: ExpiryFilter; label: string }, ...{ value: ExpiryFilter; label: string }[]] {
  return [
    {
      value: "all",
      label:
        windowDays === undefined
          ? "Vencidos y por vencer"
          : windowDays === 0
            ? "Vencidos y los que vencen hoy"
            : `Vencidos y ${upcomingDays(windowDays)}`,
    },
    { value: "expired", label: "Vencidos" },
    { value: "upcoming", label: "Por vencer" },
  ];
}

function matchesExpiry(lot: ExpiringLot, filter: ExpiryFilter): boolean {
  if (filter === "expired") {
    return lot.expired;
  }
  return filter === "all" || !lot.expired;
}

function lotOf(lot: ExpiringLot): string {
  return `${lot.lotName} de ${formatProductDescription(lot.product)}`;
}

function summaryText({ valueCents, withoutCostCount }: ExpiringLotList["summary"], count: number) {
  const lots = plural(count, { one: "1 lote", other: `${formatNumber(count)} lotes` });
  const value = `valorizado ${formatStockValue(valueCents)}`;
  return withoutCostCount === 0
    ? `${lots} · ${value}`
    : `${lots} · ${value} · ${formatNumber(withoutCostCount)} sin costo`;
}

function discardedNotice(lot: ExpiringLot, result: ExpiredLotDiscardResult) {
  const discarded = formatStockQuantity(result.quantity, lot.product.saleUnit);
  const what = lotOf(lot);
  return {
    tone: "success" as const,
    title: "Lote dado de baja",
    description: `${what}: ${discarded} como merma por vencimiento.`,
  };
}

function refusedNotice(
  outcome: Exclude<DiscardExpiredLotOutcome, { kind: "ok" | "unauthenticated" | "forbidden" }>,
) {
  const description =
    outcome.kind === "rate_limited"
      ? retryAfterDetail(outcome.retryAfterSeconds)
      : outcome.kind === "failed" || outcome.kind === "validation_failed"
        ? null
        : REFUSAL_REASONS[outcome.kind];
  return { tone: "error" as const, title: "No se pudo dar de baja el lote", description };
}

export function ExpiringLotsScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: ExpiringLotsScreenProps) {
  const [search, setSearch] = useState(filters.search);
  const [category, setCategory] = useState(filters.category);
  const [expiry, setExpiry] = useState<ExpiryFilter>(filters.expiry);
  const [discarding, setDiscarding] = useState<readonly string[]>([]);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const [shownNoticeCount, setShownNoticeCount] = useState(0);
  const reportFilters = useEffectEvent(onFiltersChange);
  const refreshStock = useRefreshStock();
  const sendToMyAccount = useSendToMyAccount();
  const retryAdvice = useRetryAdvice();

  useEffect(() => {
    const shown: ExpiringLotsFilters = { search, category, expiry };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, category, expiry, filters]);

  const data = useExpiringLotsQuery({
    fetchExpiringLots: services.fetchExpiringLots,
    onSessionEnded,
  });
  const lots = data.status === "loaded" ? data.value.lots : NO_LOTS;
  const windowDays = data.status === "loaded" ? data.value.windowDays : undefined;
  const categoryOptions = categoryFilterOptions(lots.map((lot) => lot.product));
  const categoryIsOffered = categoryOptions.some((option) => option.value === category);

  useEffect(() => {
    if (data.status === "loaded" && !categoryIsOffered) {
      setCategory("ALL");
    }
  }, [data.status, categoryIsOffered]);

  function showNotice(shown: ScreenNotice) {
    setShownNoticeCount((count) => count + 1);
    setNotice(shown);
  }

  async function discard(lot: ExpiringLot) {
    setNotice(null);
    setDiscarding((current) => [...current, lot.id]);
    const outcome = await services.discardExpiredLot(lot.id);
    setDiscarding((current) => current.filter((id) => id !== lot.id));
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "ok") {
      showNotice(discardedNotice(lot, outcome.value));
      await refreshStock();
      return;
    }
    showNotice(refusedNotice(outcome));
    if (outcome.kind !== "failed" && outcome.kind !== "rate_limited") {
      await refreshStock();
    }
  }

  const columns = [
    dataColumn({
      id: "product",
      header: "Producto",
      render: (lot: ExpiringLot) => (
        <TableCellText description={lot.product.categoryName}>
          {formatProductDescription(lot.product)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "lot",
      width: 220,
      header: "Lote",
      render: (lot: ExpiringLot) => <TableCellText strong>{lot.lotName}</TableCellText>,
    }),
    dataColumn({
      id: "expiresOn",
      width: 190,
      header: "Vence",
      render: (lot: ExpiringLot) => (
        <TableCellText
          description={expiryTiming(lot)}
          descriptionTone={lot.expired ? "error" : undefined}
        >
          {formatCalendarDayNumeric(lot.expiresOn)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "remaining",
      width: 160,
      header: "Stock estimado",
      align: "end",
      render: (lot: ExpiringLot) => (
        <TableCellText strong>
          {formatStockQuantity(lot.remaining, lot.product.saleUnit)}
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "value",
      width: 160,
      header: "Valorizado",
      align: "end",
      render: (lot: ExpiringLot) => (
        <TableCellText strong tone={lot.valueCents === null ? "subtle" : undefined}>
          {formatStockValue(lot.valueCents)}
        </TableCellText>
      ),
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones del lote",
      actions: [
        (lot: ExpiringLot) =>
          lot.expired && !discarding.includes(lot.id)
            ? {
                icon: <Trash2 />,
                "aria-label": `Dar de baja el lote ${lotOf(lot)}`,
                onPress: () => void discard(lot),
              }
            : undefined,
      ],
    }),
  ] as const;

  const table = useTableModel({
    items: lots,
    id: (lot) => lot.id,
    search: { text: search, in: (lot) => [formatProductDescription(lot.product)] },
    filter: (lot) =>
      (category === "ALL" || lot.product.categoryId === category) && matchesExpiry(lot, expiry),
    columns,
  });

  return (
    <>
      <ScreenLayout
        topBar={<AreaTopBar eyebrow="Stock" title="Vencimientos" />}
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
            name="category"
            label="Categoría:"
            searchable
            options={categoryOptions}
            value={categoryIsOffered ? category : "ALL"}
            onChange={setCategory}
          />
          <ListFilter
            name="expiry"
            label="Vencimiento:"
            options={expiryFilterOptions(windowDays)}
            value={expiry}
            onChange={setExpiry}
          />
        </div>
        <Table
          aria-label="Vencimientos"
          table={table}
          {...cloudTableState(data, "los vencimientos")}
          empty={
            windowDays !== undefined && lots.length === 0
              ? {
                  icon: <CalendarClock />,
                  title: "Sin lotes por vencer",
                  description: `Ningún lote venció ni vence ${upcomingDays(windowDays)}.`,
                  variant: "blank",
                }
              : {
                  icon: <Search />,
                  title: "Sin resultados",
                  description: "Probá con otro nombre, categoría o vencimiento.",
                  variant: "filtered",
                }
          }
          footer={
            data.status === "loaded" && lots.length > 0 ? (
              <p className="text-text-subtle text-detail">
                {summaryText(data.value.summary, lots.length)}
              </p>
            ) : undefined
          }
        />
      </ScreenLayout>
      {notice ? (
        <FloatingNotification
          key={shownNoticeCount}
          tone={notice.tone}
          icon={notice.tone === "success" ? <Check /> : <TriangleAlert />}
          title={notice.title}
          description={notice.description ?? retryAdvice}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
    </>
  );
}
