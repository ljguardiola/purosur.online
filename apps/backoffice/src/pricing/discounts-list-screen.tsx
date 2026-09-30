import type { DiscountSummary, DiscountTargets } from "@purosur/contracts";
import { argentinaCalendarDay, type DiscountStatus, discountStatus } from "@purosur/domain";
import {
  Button,
  FloatingNotification,
  ListFilter,
  SearchField,
  StatusIndicator,
  Table,
  type TableItemOrder,
  type TableSort,
  tableRows,
  textOrder,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import { BadgePercent, Check, Pencil, Plus, Search, SearchX } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { combineCloudData } from "../platform/combine-cloud-data";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import {
  DISCOUNT_KIND_LABELS,
  DISCOUNT_STATUS_PRESENTATION,
  discountBenefitText,
  discountTargetLine,
  discountValidityText,
} from "./discount-texts";
import { DiscountWeekdays } from "./discount-weekdays";
import { discountsFooterText } from "./discounts-footer-text";
import type { DiscountsListScreenServices } from "./discounts-list-services";
import { EditDiscountModal } from "./edit-discount-modal";
import { NewDiscountModal } from "./new-discount-modal";
import {
  useDiscountsQuery,
  useDiscountTargetsQuery,
  useRefreshDiscounts,
  useReloadDiscount,
} from "./pricing-queries";
import type { DiscountsListFilters } from "./routes";

export type DiscountsListScreenProps = {
  filters: DiscountsListFilters;
  onFiltersChange: (filters: DiscountsListFilters) => void;
  onSessionEnded: () => void;
  services: DiscountsListScreenServices;
  now?: () => Date;
};

type DiscountStatusFilter = DiscountsListFilters["status"];
type DiscountKindFilter = DiscountsListFilters["kind"];
type DiscountSortColumn = DiscountsListFilters["sortBy"];

const NO_DISCOUNTS: DiscountSummary[] = [];
const NO_TARGETS: DiscountTargets = { products: [], categories: [], tags: [] };

type ScreenNotice = { id: number; title: string; description: string };

const CLOCK_REFRESH_MS = 60_000;

const STATUS_RANK: Record<DiscountStatus, number> = {
  current: 0,
  scheduled: 1,
  ended: 2,
  deactivated: 3,
};

const OPEN_STATUSES: readonly DiscountStatus[] = ["current", "scheduled"];

const DISCOUNT_STATUS_EMPTY_TITLE = {
  open: "Sin promociones vigentes ni programadas",
  ended: "No hay promociones terminadas",
  deactivated: "No hay promociones desactivadas",
  all: "Sin resultados",
} satisfies Record<DiscountStatusFilter, string>;

const statusFilterOptions = [
  { value: "open" as const, label: "Vigentes y programadas" },
  { value: "ended" as const, label: "Terminadas" },
  { value: "deactivated" as const, label: "Desactivadas" },
  { value: "all" as const, label: "Todas" },
] as const;

const kindFilterOptions = [
  { value: "ALL" as const, label: "Todos" },
  ...(Object.entries(DISCOUNT_KIND_LABELS) as [Exclude<DiscountKindFilter, "ALL">, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
] as const;

const nameOrder = textOrder((discount: DiscountSummary) => discount.name);

const benefitOrder: TableItemOrder<DiscountSummary> = (a, b) =>
  a.benefit.percent - b.benefit.percent || nameOrder(a, b);

const validityOrder: TableItemOrder<DiscountSummary> = (a, b) =>
  a.validFrom.localeCompare(b.validFrom) || a.validTo.localeCompare(b.validTo) || nameOrder(a, b);

function showsStatus(status: DiscountStatus, statusFilter: DiscountStatusFilter): boolean {
  if (statusFilter === "all") {
    return true;
  }
  return statusFilter === "open" ? OPEN_STATUSES.includes(status) : status === statusFilter;
}

export function DiscountsListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
  now,
}: DiscountsListScreenProps) {
  const clock = now ?? (() => new Date());
  const discountsData = useDiscountsQuery({
    fetchDiscounts: services.fetchDiscounts,
    onSessionEnded,
  });
  const targetsData = useDiscountTargetsQuery({
    fetchDiscountTargets: services.fetchDiscountTargets,
    onSessionEnded,
  });
  const data = combineCloudData(discountsData, targetsData);
  const refreshDiscounts = useRefreshDiscounts();
  const reloadDiscount = useReloadDiscount({ fetchDiscounts: services.fetchDiscounts });
  const [today, setToday] = useState(() => argentinaCalendarDay(clock()));
  const [search, setSearch] = useState(filters.search);
  const [kindFilter, setKindFilter] = useState<DiscountKindFilter>(filters.kind);
  const [statusFilter, setStatusFilter] = useState<DiscountStatusFilter>(filters.status);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DiscountSummary | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);
  const [sort, setSort] = useState<TableSort<DiscountSortColumn>>({
    column: filters.sortBy,
    direction: filters.sort,
  });
  const reportFilters = useEffectEvent(onFiltersChange);
  const readClock = useEffectEvent(() => argentinaCalendarDay(clock()));

  useEffect(() => {
    const shown: DiscountsListFilters = {
      search,
      kind: kindFilter,
      status: statusFilter,
      sortBy: sort.column,
      sort: sort.direction,
    };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, kindFilter, statusFilter, sort.column, sort.direction, filters]);

  useEffect(() => {
    if (data.status === "failed") {
      setEditTarget(null);
    }
  }, [data.status]);

  const listSettled = data.status === "loaded" && !data.refreshing;
  useEffect(() => {
    if (listSettled) {
      setToday(readClock());
    }
  }, [listSettled]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setToday(readClock()), CLOCK_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  const [{ discounts }, targets] =
    data.status === "loaded" ? data.value : [{ discounts: NO_DISCOUNTS }, NO_TARGETS];
  const statusOf = (discount: DiscountSummary) => discountStatus(discount, today);
  const statusOrder: TableItemOrder<DiscountSummary> = (a, b) =>
    STATUS_RANK[statusOf(a)] - STATUS_RANK[statusOf(b)] || nameOrder(a, b);
  const { rows, matchCount } = tableRows({
    items: discounts,
    id: (discount) => discount.id,
    search: { text: search, in: (discount) => [discount.name, discount.target.name] },
    filter: (discount) =>
      (kindFilter === "ALL" || discount.benefit.kind === kindFilter) &&
      showsStatus(statusOf(discount), statusFilter),
    sort: {
      by: sort,
      orders: {
        promotion: nameOrder,
        benefit: benefitOrder,
        validity: validityOrder,
        status: statusOrder,
      },
    },
  });

  const columns = [
    {
      key: "promotion",
      header: "Promoción",
      sortable: true,
      defaultDirection: "ascending",
      render: (item: DiscountSummary) => (
        <div className="flex flex-col">
          <span>{item.name}</span>
          <span className="text-text-subtle text-detail">{discountTargetLine(item.target)}</span>
        </div>
      ),
    },
    {
      key: "benefit",
      header: "Beneficio",
      sortable: true,
      defaultDirection: "ascending",
      render: (item: DiscountSummary) => discountBenefitText(item.benefit),
    },
    {
      key: "validity",
      header: "Vigencia",
      sortable: true,
      defaultDirection: "ascending",
      render: (item: DiscountSummary) => discountValidityText(item.validFrom, item.validTo),
    },
    {
      key: "days",
      header: "Días",
      render: (item: DiscountSummary) => <DiscountWeekdays weekdays={item.weekdays} />,
    },
    {
      key: "status",
      header: "Estado",
      sortable: true,
      defaultDirection: "ascending",
      render: (item: DiscountSummary) => {
        const { label, tone } = DISCOUNT_STATUS_PRESENTATION[statusOf(item)];
        return <StatusIndicator tone={tone}>{label}</StatusIndicator>;
      },
    },
    {
      key: "actions",
      kind: "actions",
      header: "Acciones",
      actions: [
        (item: DiscountSummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar la promoción ${item.name}`,
          onPress: () => setEditTarget(item),
        }),
      ],
    },
  ] as const;

  const matched = rows.map((row) => row.item);
  const currentCount = matched.filter((discount) => statusOf(discount) === "current").length;

  function showNotice(shown: Omit<ScreenNotice, "id">) {
    lastNoticeId.current += 1;
    setNotice({ ...shown, id: lastNoticeId.current });
  }

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Catálogo</p>
              <ScreenTitle>Promociones</ScreenTitle>
            </div>
            <Button
              variant="primary"
              icon={<Plus />}
              dataStatus={data.status}
              onPress={() => setNewModalOpen(true)}
            >
              Nueva promoción
            </Button>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-105">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar una promoción"
              icon={<Search />}
            />
          </div>
          <ListFilter
            label="Tipo:"
            options={kindFilterOptions}
            value={kindFilter}
            onChange={setKindFilter}
          />
          <ListFilter
            label="Estado:"
            options={statusFilterOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <Table
          aria-label="Promociones"
          columns={columns}
          sort={sort}
          onSortChange={setSort}
          {...cloudTableState(data, "las promociones")}
          rows={rows}
          empty={
            discounts.length === 0
              ? {
                  icon: <BadgePercent />,
                  title: "Todavía no hay promociones",
                  description:
                    "Se cargan para ofrecer un descuento sobre un producto, una categoría o un distintivo.",
                  variant: "blank",
                }
              : search.trim() === ""
                ? {
                    icon: <SearchX />,
                    title: DISCOUNT_STATUS_EMPTY_TITLE[statusFilter],
                    ...(statusFilter === "open"
                      ? {
                          description:
                            "Las promociones terminadas se ven cambiando el filtro de estado.",
                        }
                      : {}),
                    variant: "filtered",
                  }
                : {
                    icon: <SearchX />,
                    title: "Sin resultados",
                    description: "Probá con otro nombre.",
                    variant: "filtered",
                  }
          }
          footer={
            matchCount === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {discountsFooterText({ shown: matchCount, current: currentCount })}
              </p>
            )
          }
        />
      </ScreenLayout>
      {data.status === "loaded" ? (
        <EditDiscountModal
          target={editTarget}
          targets={targets}
          services={services}
          reload={reloadDiscount}
          onSaved={(saved) => {
            setEditTarget(null);
            void refreshDiscounts();
            showNotice({
              title: "Promoción actualizada",
              description: `Se guardaron los cambios de «${saved.name}».`,
            });
          }}
          onClose={() => setEditTarget(null)}
          onSessionEnded={onSessionEnded}
        />
      ) : null}
      <NewDiscountModal
        open={newModalOpen}
        targets={targets}
        services={services}
        onCreated={(created) => {
          setNewModalOpen(false);
          void refreshDiscounts();
          showNotice({
            title: "Promoción creada",
            description: `«${created.name}» ya está en la lista.`,
          });
        }}
        onClose={() => setNewModalOpen(false)}
        onSessionEnded={onSessionEnded}
      />
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
