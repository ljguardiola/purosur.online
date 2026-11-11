import type {
  ExpiredLotDiscardResult,
  ExpiringLot,
  ExpiringLotList,
  ExpiringLotsReportBody,
} from "@purosur/contracts";
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
import type { BackofficeAccess } from "../shell/backoffice-access";
import { BranchTermChange } from "../shell/branch-term-change";
import { ReportDownload } from "../shell/report-download";
import { reportFileName } from "../shell/report-file-name";
import { ReportFilters } from "../shell/report-filters";
import { expiryTiming } from "./expiring-lot-timing";
import { expiringLotsReportSpreadsheet } from "./expiring-lots-report-spreadsheet";
import type { ExpiringLotsScreenServices } from "./expiring-lots-services";
import type { ExpiringLotsFilters } from "./routes";
import type { DiscardExpiredLotOutcome } from "./stock-api";
import { formatStockValue } from "./stock-cost";
import { useExpiringLotsQuery, useExpiringLotsReportQuery, useRefreshStock } from "./stock-queries";
import { categoryFilterOptions } from "./stock-screen-parts";

export type ExpiringLotsScreenProps = {
  access: BackofficeAccess;
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

const REPORT_TITLE = "Lotes por vencer";

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

function lotOfReport({
  id,
  lot_name,
  expires_on,
  remaining,
  value_cents,
  expired,
  days_to_expiry,
  product,
}: ExpiringLotsReportBody["lots"][number]): ExpiringLot {
  return {
    id,
    lotName: lot_name,
    expiresOn: expires_on,
    remaining,
    valueCents: value_cents,
    expired,
    daysToExpiry: days_to_expiry,
    product: {
      id: product.id,
      name: product.name,
      brandName: product.brand_name,
      netContent: product.net_content,
      categoryId: product.category_id,
      categoryName: product.category_name,
      saleUnit: product.sale_unit,
    },
  };
}

function lotOf(lot: ExpiringLot): string {
  return `${lot.lotName} de ${formatProductDescription(lot.product)}`;
}

function emptyList(windowDays: number | undefined, periodChosen: boolean, count: number) {
  if (windowDays === undefined || count > 0) {
    return {
      icon: <Search />,
      title: "Sin resultados",
      description: "Probá con otro nombre, categoría o vencimiento.",
      variant: "filtered" as const,
    };
  }
  return periodChosen
    ? {
        icon: <CalendarClock />,
        title: "No hay lotes que venzan en este período",
        variant: "blank" as const,
      }
    : {
        icon: <CalendarClock />,
        title: "Sin lotes por vencer",
        description: `Ningún lote venció ni vence ${upcomingDays(windowDays)}.`,
        variant: "blank" as const,
      };
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
  access,
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
    const shown: ExpiringLotsFilters = {
      search,
      category,
      expiry,
      from: filters.from,
      to: filters.to,
    };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, category, expiry, filters]);

  const periodChosen = filters.from !== "";
  const upcoming = useExpiringLotsQuery({
    fetchExpiringLots: services.fetchExpiringLots,
    onSessionEnded,
  });
  const report = useExpiringLotsReportQuery({
    query: periodChosen ? { from: filters.from, to: filters.to } : {},
    fetchExpiringLotsReport: services.fetchExpiringLotsReport,
    onSessionEnded,
  });
  const shownReport = report.status === "loaded" ? report.value : report.lastValue;
  const data = periodChosen ? report : upcoming;
  const listing: ExpiringLotList | undefined = periodChosen
    ? report.status === "loaded"
      ? {
          windowDays: report.value.window_days,
          lots: report.value.lots.map(lotOfReport),
          summary: {
            valueCents: report.value.summary.value_cents,
            withoutCostCount: report.value.summary.without_cost_count,
          },
        }
      : undefined
    : upcoming.status === "loaded"
      ? upcoming.value
      : undefined;
  const lots = listing?.lots ?? NO_LOTS;
  const windowDays = listing?.windowDays;
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
      <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
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
          <ReportFilters
            filters={filters}
            onFiltersChange={({ from, to }) =>
              onFiltersChange({ search, category, expiry, from, to })
            }
            answeredPeriod={shownReport?.period}
            trailing={
              <ReportDownload
                dataStatus={report.status}
                workbook={() => (shownReport ? expiringLotsReportSpreadsheet(shownReport) : null)}
                fileName={shownReport ? reportFileName(REPORT_TITLE, shownReport.period) : ""}
              />
            }
          />
          <div className="ml-auto">
            <BranchTermChange
              term="expiringLotAlertDays"
              value={windowDays}
              status={data.status}
              access={access}
              onSessionEnded={onSessionEnded}
              onChanged={() => void refreshStock()}
              services={services.branchTerm}
            />
          </div>
        </div>
        <Table
          aria-label="Vencimientos"
          table={table}
          {...cloudTableState(data, "los vencimientos")}
          empty={emptyList(windowDays, periodChosen, lots.length)}
          footer={
            listing && lots.length > 0 ? (
              <p className="text-text-subtle text-detail">
                {summaryText(listing.summary, lots.length)}
              </p>
            ) : undefined
          }
        />
      </div>
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
