import type { PriceCategory, PriceProduct } from "@purosur/contracts";
import {
  Button,
  dataColumn,
  FloatingNotification,
  IconButton,
  ListFilter,
  plural,
  SearchField,
  sortedItems,
  Table,
  Tag,
  Tooltip,
  textOrder,
  useTableModel,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import {
  BadgeCheck,
  Ban,
  Check,
  ListChecks,
  Package,
  Pencil,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { formatCentsWithUnit } from "./money";
import { PriceChangeModal, type PriceModalOutcome, type ScreenNotice } from "./price-change-modal";
import { emptyPendingDetail, reviewedCellText } from "./price-review-age";
import type { ConfirmPriceOutcome, PricesReviewFilter } from "./prices-api";
import type { PricesListScreenServices } from "./prices-list-services";
import {
  usePricesQuery,
  useReadReviewQueue,
  useRefreshPrices,
  useReloadPrice,
} from "./pricing-queries";
import type { PricesListFilters } from "./routes";

export type PricesListScreenProps = {
  filters: PricesListFilters;
  onFiltersChange: (filters: PricesListFilters) => void;
  onSessionEnded: () => void;
  services: PricesListScreenServices;
};

const NO_PRODUCTS: PriceProduct[] = [];
const NO_CATEGORIES: PriceCategory[] = [];

const SEARCH_DEBOUNCE_MS = 300;

const categoryNameOrder = textOrder((category: PriceCategory) => category.name);

function emptyTableState(params: {
  activeProductCount: number;
  reviewFilter: PricesReviewFilter;
  pendingCount: number;
  reviewWindowDays: number;
}) {
  if (params.activeProductCount === 0) {
    return {
      icon: <Package />,
      title: "No hay productos activos",
      description: "Creá uno en Productos para ponerle precio.",
      variant: "blank" as const,
    };
  }
  if (params.reviewFilter === "pending" && params.pendingCount === 0) {
    return {
      icon: <BadgeCheck />,
      title: "Precios al día",
      description: emptyPendingDetail({ days: params.reviewWindowDays }),
      variant: "blank" as const,
    };
  }
  return {
    icon: <Search />,
    title: "Sin resultados",
    description: "Probá con otro nombre o categoría.",
    variant: "filtered" as const,
  };
}

export function PricesListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: PricesListScreenProps) {
  const sendToMyAccount = useSendToMyAccount();
  const {
    fetchPrices: fetchPricesService,
    setPrice: setPriceService,
    confirmPrice: confirmPriceService,
  } = services;

  const [search, setSearch] = useState(filters.search);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search.trim());
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | string>(filters.category);
  const [reviewFilter, setReviewFilter] = useState<PricesReviewFilter>(filters.review);
  const [modal, setModal] = useState<{
    target: PriceProduct;
    previousProductNotice: ScreenNotice | null;
  } | null>(null);
  const [walk, setWalk] = useState<{ queue: PriceProduct[]; index: number } | null>(null);
  const [notice, setNotice] = useState<(ScreenNotice & { id: number }) | null>(null);
  const lastNoticeId = useRef(0);
  const [screenRequestInFlight, setScreenRequestInFlight] = useState(false);

  const reportFilters = useEffectEvent(onFiltersChange);

  useEffect(() => {
    const shown: PricesListFilters = { search, category: categoryFilter, review: reviewFilter };
    if (!deepEqual(shown, filters)) {
      reportFilters(shown);
    }
  }, [search, categoryFilter, reviewFilter, filters]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search]);

  // Each notice gets a fresh id: an unchanged id would leave the live region's text identical, and
  // screen readers don't re-announce a live region that already holds that text.
  function showScreenNotice(shown: ScreenNotice) {
    lastNoticeId.current += 1;
    setNotice({ ...shown, id: lastNoticeId.current });
  }

  function clearErrorNotice() {
    setNotice((shown) => (shown?.tone === "error" ? null : shown));
  }

  const data = usePricesQuery({
    input: {
      review: reviewFilter,
      ...(categoryFilter !== "ALL" ? { categoryId: categoryFilter } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    },
    fetchPrices: fetchPricesService,
    onSessionEnded,
  });
  const readReviewQueue = useReadReviewQueue({ fetchPrices: fetchPricesService });
  const reloadPrice = useReloadPrice({ fetchPrices: fetchPricesService });
  const refreshPrices = useRefreshPrices();

  const loaded = data.status === "loaded" ? data.value : undefined;
  const lastLoaded = data.status === "loaded" ? undefined : data.lastValue;
  const categories = loaded?.categories ?? lastLoaded?.categories ?? NO_CATEGORIES;
  const categoryFilterIsOffered =
    categoryFilter === "ALL" || categories.some(({ id }) => id === categoryFilter);
  const listIsFresh = data.status === "loaded" && !data.refreshing;

  useEffect(() => {
    if (listIsFresh && !categoryFilterIsOffered) {
      setCategoryFilter("ALL");
    }
  }, [listIsFresh, categoryFilterIsOffered]);

  useEffect(() => {
    if (data.status === "failed") {
      setWalk(null);
      setModal(null);
    }
  }, [data.status]);

  const products = loaded?.products ?? NO_PRODUCTS;
  const pendingCount = loaded?.pendingCount ?? 0;
  const activeProductCount = loaded?.activeProductCount ?? 0;
  const reviewWindowDays = loaded?.reviewWindowDays ?? 30;

  const shownData =
    data.status === "failed"
      ? {
          ...data,
          retry: () => {
            clearErrorNotice();
            data.retry();
          },
        }
      : data;

  const categoryFilterOptions = (() => {
    const sorted = sortedItems(categories, {
      order: categoryNameOrder,
      direction: "ascending",
    });
    return [
      { value: "ALL" as const, label: "Todas" },
      ...sorted.map((category) => ({ value: category.id, label: category.name })),
    ] as [{ value: string; label: string }, ...{ value: string; label: string }[]];
  })();

  const reviewFilterOptions = [
    { value: "pending" as const, label: "Por revisar" },
    { value: "all" as const, label: "Todos" },
  ] as const;

  const reviewStartFailedNotice: ScreenNotice = {
    tone: "error",
    title: "No se pudo empezar la revisión",
    description: "Probá de nuevo.",
  };

  function rateLimitedNotice(retryAfterSeconds: number): ScreenNotice {
    return {
      tone: "error",
      title: "Demasiadas solicitudes",
      description: retryAfterDetail(retryAfterSeconds),
      retryAfterSeconds,
    };
  }

  async function handleReviewButton() {
    clearErrorNotice();
    setScreenRequestInFlight(true);
    handleReviewReadOutcome(await readReviewQueue());
    setScreenRequestInFlight(false);
  }

  function handleReviewReadOutcome(outcome: Awaited<ReturnType<typeof readReviewQueue>>) {
    if (outcome.kind === "ok") {
      const [first] = outcome.value.products;
      if (!first) {
        void refreshPrices();
        if (reviewFilter !== "pending") {
          showScreenNotice({
            tone: "success",
            title: "No quedan precios por revisar",
            description: emptyPendingDetail({ days: outcome.value.reviewWindowDays }),
          });
        }
        return;
      }
      setWalk({ queue: outcome.value.products, index: 0 });
      setModal({ target: first, previousProductNotice: null });
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "rate_limited") {
      showScreenNotice(rateLimitedNotice(outcome.retryAfterSeconds));
      return;
    }
    showScreenNotice(reviewStartFailedNotice);
  }

  function reviewedNotice(product: PriceProduct, outcome: PriceModalOutcome): ScreenNotice {
    const cents = outcome.kind === "saved" ? outcome.unitPrice : product.currentPrice?.unitPrice;
    const amount = cents !== undefined ? formatCentsWithUnit(cents, product.saleUnit) : "";
    return outcome.kind === "confirmed"
      ? {
          tone: "success",
          title: "Precio confirmado",
          description: `${product.name} sigue a ${amount}.`,
        }
      : {
          tone: "success",
          title: "Precio actualizado",
          description: `${product.name} pasa a ${amount}.`,
        };
  }

  function goneNotice(product: PriceProduct): ScreenNotice {
    return {
      tone: "error",
      title: "Producto desactivado",
      description: `${product.name} ya no está en el catálogo.`,
    };
  }

  function moveToNextInWalkOrClose(previousProductNotice: ScreenNotice) {
    const next = walk?.queue[walk.index + 1];
    if (walk && next) {
      setWalk({ queue: walk.queue, index: walk.index + 1 });
      setModal({ target: next, previousProductNotice });
      return;
    }
    setWalk(null);
    setModal(null);
    showScreenNotice(previousProductNotice);
  }

  function handleModalSaved(product: PriceProduct, outcome: PriceModalOutcome) {
    void refreshPrices();
    moveToNextInWalkOrClose(reviewedNotice(product, outcome));
  }

  function handleModalProductGone(product: PriceProduct) {
    void refreshPrices();
    if (walk) {
      moveToNextInWalkOrClose(goneNotice(product));
    }
  }

  function handleModalClose() {
    setWalk(null);
    setModal(null);
  }

  async function handleRowConfirm(item: PriceProduct) {
    if (!item.currentPrice) {
      return;
    }
    clearErrorNotice();
    setScreenRequestInFlight(true);
    try {
      const outcome = await confirmPriceService(item.id, {
        expectedCurrentPriceId: item.currentPrice.id,
      });
      handleRowConfirmOutcome(item, outcome);
    } catch {
      showScreenNotice(rowConfirmFailedNotice(item));
    }
    setScreenRequestInFlight(false);
  }

  function rowConfirmFailedNotice(item: PriceProduct): ScreenNotice {
    return {
      tone: "error",
      title: `No se pudo confirmar el precio de ${item.name}`,
      description: "Probá de nuevo.",
    };
  }

  function handleRowConfirmOutcome(item: PriceProduct, outcome: ConfirmPriceOutcome) {
    if (outcome.kind === "ok") {
      void refreshPrices();
      showScreenNotice(reviewedNotice(item, { kind: "confirmed" }));
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "stale_price") {
      void refreshPrices();
      showScreenNotice({
        tone: "error",
        title: "El precio cambió recién",
        description: `Revisá el precio actual de ${item.name}.`,
      });
      return;
    }
    if (outcome.kind === "not_found") {
      void refreshPrices();
      showScreenNotice(goneNotice(item));
      return;
    }
    if (outcome.kind === "no_price_to_confirm") {
      void refreshPrices();
      showScreenNotice({
        tone: "error",
        title: "No hay un precio para confirmar",
        description: `${item.name} todavía no tiene precio.`,
      });
      return;
    }
    if (outcome.kind === "rate_limited") {
      showScreenNotice(rateLimitedNotice(outcome.retryAfterSeconds));
      return;
    }
    showScreenNotice(rowConfirmFailedNotice(item));
  }

  const columns = [
    dataColumn({
      id: "product",
      header: "Producto",
      render: (item: PriceProduct) => (
        <div className="flex items-center gap-2">
          <span>{item.name}</span>
          {!item.currentPrice && (
            <Tag tone="neutral" icon={<Ban aria-hidden="true" />}>
              Sin precio
            </Tag>
          )}
        </div>
      ),
    }),
    dataColumn({
      id: "price",
      header: "Precio",
      render: (item: PriceProduct) =>
        item.currentPrice ? formatCentsWithUnit(item.currentPrice.unitPrice, item.saleUnit) : "—",
    }),
    dataColumn({
      id: "reviewed",
      header: "Revisado",
      render: (item: PriceProduct) => reviewedCellText(item.secondsSinceReview),
    }),
    dataColumn({
      id: "actions",
      header: "Acciones",
      align: "end",
      render: (item: PriceProduct) => (
        <div className="flex flex-row items-center justify-end gap-2">
          {item.currentPrice ? (
            <Tooltip description="Confirmar sin cambios: cuenta como revisar el precio.">
              <IconButton
                icon={<Check />}
                aria-label={`Confirmar el precio de ${item.name} sin cambios`}
                disabled={screenRequestInFlight}
                onPress={() => void handleRowConfirm(item)}
              />
            </Tooltip>
          ) : null}
          <IconButton
            icon={<Pencil />}
            aria-label={`Cambiar el precio de ${item.name}`}
            disabled={screenRequestInFlight}
            onPress={() => {
              clearErrorNotice();
              setModal({ target: item, previousProductNotice: null });
            }}
          />
        </div>
      ),
    }),
  ] as const;

  const table = useTableModel({
    items: products,
    id: (product) => product.id,
    columns,
  });

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Catálogo</p>
              <ScreenTitle>Precios</ScreenTitle>
            </div>
            {loaded && pendingCount === 0 ? null : (
              <Button
                variant="primary"
                icon={<ListChecks />}
                dataStatus={data.status}
                disabled={screenRequestInFlight}
                onPress={() => void handleReviewButton()}
              >
                {loaded
                  ? plural(pendingCount, { one: "Revisar 1", other: `Revisar los ${pendingCount}` })
                  : "Revisar"}
              </Button>
            )}
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-105">
            <SearchField
              value={search}
              onChange={(value) => {
                clearErrorNotice();
                setSearch(value);
              }}
              placeholder="Buscar un producto"
              icon={<Search />}
            />
          </div>
          <ListFilter
            label="Categoría:"
            options={categoryFilterOptions}
            value={categoryFilter}
            onChange={(value) => {
              clearErrorNotice();
              setCategoryFilter(value);
            }}
          />
          <ListFilter
            label="Revisión:"
            options={reviewFilterOptions}
            value={reviewFilter}
            onChange={(value) => {
              clearErrorNotice();
              setReviewFilter(value);
            }}
          />
        </div>
        <Table
          aria-label="Precios"
          table={table}
          {...cloudTableState(shownData, "los precios")}
          empty={emptyTableState({
            activeProductCount,
            reviewFilter,
            pendingCount,
            reviewWindowDays,
          })}
          footer={
            products.length === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {reviewFilter === "pending"
                  ? plural(products.length, {
                      one: "1 producto sin revisar, del más viejo al más nuevo",
                      other: `${products.length} productos sin revisar, del más viejo al más nuevo`,
                    })
                  : plural(products.length, {
                      one: "1 producto",
                      other: `${products.length} productos`,
                    })}
              </p>
            )
          }
        />
      </ScreenLayout>
      <PriceChangeModal
        target={modal?.target ?? null}
        previousProductNotice={modal?.previousProductNotice ?? null}
        onClose={handleModalClose}
        onSessionEnded={onSessionEnded}
        onSaved={handleModalSaved}
        onGone={handleModalProductGone}
        reload={reloadPrice}
        setPrice={setPriceService}
        confirmPrice={confirmPriceService}
      />
      {notice ? (
        <FloatingNotification
          key={notice.id}
          tone={notice.tone}
          icon={notice.tone === "success" ? <Check /> : <TriangleAlert />}
          title={notice.title}
          description={notice.description}
          expiresAfterSeconds={notice.retryAfterSeconds}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
    </>
  );
}
