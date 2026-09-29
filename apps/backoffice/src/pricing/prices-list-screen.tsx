import { type PriceCategory, type PriceProduct, priceSetBodySchema } from "@purosur/contracts";
import {
  Button,
  FloatingNotification,
  IconButton,
  InlineNotice,
  ListFilter,
  Modal,
  NotificationCard,
  plural,
  SearchField,
  sortedItems,
  Table,
  Tag,
  Tooltip,
  tableRows,
  textOrder,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import {
  BadgeCheck,
  Ban,
  Check,
  ListChecks,
  Package,
  Pencil,
  RotateCcw,
  Search,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useSendToMyAccount } from "../access/send-to-my-account";
import type { ProductSaleUnit } from "../catalog/products-api";
import { type CloudSubmission, useCloudForm } from "../platform/cloud-form";
import { cloudTableState } from "../platform/cloud-table-state";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { formatCents, MAX_UNIT_PRICE_CENTS, parseAmountCents } from "./money";
import type {
  ConfirmPriceOutcome,
  confirmPrice,
  PricesReviewFilter,
  SetPriceOutcome,
  setPrice,
} from "./prices-api";
import type { PricesListScreenServices } from "./prices-list-services";
import {
  type PriceReload,
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
  now?: () => Date;
};

const NO_PRODUCTS: PriceProduct[] = [];
const NO_CATEGORIES: PriceCategory[] = [];

const DAY_MS = 24 * 60 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 300;

const categoryNameOrder = textOrder((category: PriceCategory) => category.name);

const AMOUNT_REQUIRED = "Ingresá el precio nuevo.";
const AMOUNT_MALFORMED = "Escribí el precio con coma para los decimales, por ejemplo 7.500,50.";
const AMOUNT_OUT_OF_RANGE = `Ingresá un precio mayor a cero, de hasta ${formatCents(MAX_UNIT_PRICE_CENTS)}.`;
const AMOUNT_REVIEW = "Revisá el precio.";
const AMOUNT_UNCHANGED = "Es el precio actual: confirmalo sin cambios en vez de guardarlo.";

const PRICE_LABEL = {
  UNIT: "Precio de venta por unidad",
  KG: "Precio de venta por kilo",
} satisfies Record<ProductSaleUnit, string>;

const UNIT_SUFFIX = { UNIT: "", KG: "/ kg" } satisfies Record<ProductSaleUnit, string>;

function formatCentsWithUnit(cents: number, saleUnit: ProductSaleUnit): string {
  const suffix = UNIT_SUFFIX[saleUnit];
  return suffix ? `${formatCents(cents)} ${suffix}` : formatCents(cents);
}

type PriceFormValues = { amount: string; expectedCurrentPriceId: string | null };

const EMPTY_PRICE_FORM: PriceFormValues = { amount: "", expectedCurrentPriceId: null };

function amountMessage({ amount }: PriceFormValues): string {
  if (amount.trim() === "") {
    return AMOUNT_REQUIRED;
  }
  const cents = parseAmountCents(amount);
  if (cents === undefined) {
    return AMOUNT_MALFORMED;
  }
  return priceSetBodySchema.shape.unitPrice.safeParse(cents).success
    ? AMOUNT_REVIEW
    : AMOUNT_OUT_OF_RANGE;
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function calendarDaysSince(at: string, now: Date): number {
  return Math.round((startOfLocalDay(now) - startOfLocalDay(new Date(at))) / DAY_MS);
}

function reviewedCellText(lastReviewedAt: string | null, now: Date): string {
  if (!lastReviewedAt) {
    return "Nunca";
  }
  const days = calendarDaysSince(lastReviewedAt, now);
  return days <= 0 ? "Hoy" : plural(days, { one: "Hace 1 día", other: `Hace ${days} días` });
}

function eyebrowOverdue(days: number): string {
  return plural(days, { one: "Sin revisar hace 1 día", other: `Sin revisar hace ${days} días` });
}

function eyebrowRecent(days: number): string {
  return plural(days, { one: "Revisado hace 1 día", other: `Revisado hace ${days} días` });
}

function modalEyebrow(product: PriceProduct, now: Date): string {
  if (!product.currentPrice || !product.lastReviewedAt) {
    return "Sin precio";
  }
  const days = calendarDaysSince(product.lastReviewedAt, now);
  if (days <= 0) {
    return "Revisado hoy";
  }
  return product.pending ? eyebrowOverdue(days) : eyebrowRecent(days);
}

function emptyPendingDetail(params: { days: number }): string {
  return plural(params.days, {
    one: "Todos los precios se revisaron en el último día.",
    other: `Todos los precios se revisaron en los últimos ${params.days} días.`,
  });
}

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

type PriceModalOutcome = { kind: "confirmed" } | { kind: "saved"; unitPrice: number };

type ModalNotice =
  | { kind: "attemptFailed" }
  | { kind: "confirmFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "stale" }
  | { kind: "noPriceToConfirm" }
  | { kind: "notFound" }
  | { kind: "reloadFailed" };

type ScreenNotice = {
  tone: "success" | "error";
  title: string;
  description: string;
  retryAfterSeconds?: number;
};

type PriceChangeModalProps = {
  target: PriceProduct | null;
  previousProductNotice: ScreenNotice | null;
  now: () => Date;
  onClose: () => void;
  onSessionEnded: () => void;
  onSaved: (product: PriceProduct, outcome: PriceModalOutcome) => void;
  onGone: (product: PriceProduct) => void;
  reload: (id: string) => Promise<PriceReload>;
  setPrice: typeof setPrice;
  confirmPrice: typeof confirmPrice;
};

function PriceChangeModal({
  target,
  previousProductNotice,
  now,
  onClose,
  onSessionEnded,
  onSaved,
  onGone,
  reload,
  setPrice,
  confirmPrice,
}: PriceChangeModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [current, setCurrent] = useState<PriceProduct | null>(null);
  const [shownAt, setShownAt] = useState<Date | null>(null);
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<ModalNotice | null>(null);
  const [previousNotice, setPreviousNotice] = useState<ScreenNotice | null>(null);
  const [working, setWorking] = useState(false);
  const { form, submit, submitting, reset } = useCloudForm({
    defaultValues: EMPTY_PRICE_FORM,
    request: {
      schema: priceSetBodySchema,
      from: ({ amount, expectedCurrentPriceId }) => ({
        unitPrice: parseAmountCents(amount) ?? Number.NaN,
        expectedCurrentPriceId,
      }),
    },
    fields: { unitPrice: "amount", expectedCurrentPriceId: null },
    messages: { amount: amountMessage },
    onSubmit: async (request, submission) => {
      const product = current;
      if (!product) {
        return;
      }
      setNotice(null);
      setPreviousNotice(null);
      try {
        handleSetPriceOutcome(
          product,
          request.unitPrice,
          await setPrice(product.id, request),
          submission,
        );
      } catch {
        showNotice({ kind: "attemptFailed" });
      }
    },
  });
  const busy = submitting || working;

  function showNotice(ownNotice: ModalNotice) {
    setNotice(ownNotice);
    setPreviousNotice(null);
  }

  function startRequest() {
    setNotice(null);
    setPreviousNotice(null);
    setWorking(true);
  }

  const readNow = useEffectEvent(now);

  useEffect(() => {
    if (target) {
      setCurrent(target);
      setShownAt(readNow());
      setTitle(target.name);
      reset({ amount: "", expectedCurrentPriceId: target.currentPrice?.id ?? null });
      setNotice(null);
      setPreviousNotice(previousProductNotice);
      setWorking(false);
    }
  }, [target, previousProductNotice, reset]);

  function handleSetPriceOutcome(
    product: PriceProduct,
    unitPrice: number,
    outcome: SetPriceOutcome,
    { showFieldError, showWireFieldError }: CloudSubmission<PriceFormValues>,
  ) {
    if (outcome.kind === "ok") {
      onSaved(product, { kind: "saved", unitPrice });
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
    if (outcome.kind === "not_found") {
      showNotice({ kind: "notFound" });
      onGone(product);
    } else if (outcome.kind === "stale_price") {
      showNotice({ kind: "stale" });
    } else if (outcome.kind === "price_unchanged") {
      showFieldError("amount", AMOUNT_UNCHANGED);
    } else if (outcome.kind === "validation_failed") {
      if (!showWireFieldError(outcome.field)) {
        showNotice(
          outcome.field === "expectedCurrentPriceId"
            ? { kind: "stale" }
            : { kind: "attemptFailed" },
        );
      }
    } else if (outcome.kind === "rate_limited") {
      showNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      showNotice({ kind: "attemptFailed" });
    }
  }

  function handleConfirmPriceOutcome(product: PriceProduct, outcome: ConfirmPriceOutcome) {
    if (outcome.kind === "ok") {
      onSaved(product, { kind: "confirmed" });
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
    if (outcome.kind === "not_found") {
      showNotice({ kind: "notFound" });
      onGone(product);
    } else if (outcome.kind === "stale_price") {
      showNotice({ kind: "stale" });
    } else if (outcome.kind === "no_price_to_confirm") {
      showNotice({ kind: "noPriceToConfirm" });
    } else if (outcome.kind === "rate_limited") {
      showNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      showNotice({ kind: "confirmFailed" });
    }
  }

  async function handleConfirm() {
    const product = current;
    if (!product?.currentPrice) {
      return;
    }
    startRequest();
    try {
      const outcome = await confirmPrice(product.id, {
        expectedCurrentPriceId: product.currentPrice.id,
      });
      handleConfirmPriceOutcome(product, outcome);
    } catch {
      showNotice({ kind: "confirmFailed" });
    }
    setWorking(false);
  }

  async function handleReload() {
    const product = current;
    if (!product) {
      return;
    }
    setPreviousNotice(null);
    setWorking(true);
    handleReloadOutcome(product, await reload(product.id));
    setWorking(false);
  }

  function handleReloadOutcome(product: PriceProduct, outcome: PriceReload) {
    if (outcome.kind === "found") {
      setCurrent(outcome.product);
      reset({
        amount: form.state.values.amount,
        expectedCurrentPriceId: outcome.product.currentPrice?.id ?? null,
      });
      setShownAt(now());
      setNotice(null);
      return;
    }
    if (outcome.kind === "not_found") {
      showNotice({ kind: "notFound" });
      onGone(product);
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
      showNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    showNotice({ kind: "reloadFailed" });
  }

  const offersReload =
    notice?.kind === "stale" ||
    notice?.kind === "noPriceToConfirm" ||
    notice?.kind === "reloadFailed";
  const actionsDisabled = busy || notice?.kind === "notFound";

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Pencil />}
      context={current && shownAt ? modalEyebrow(current, shownAt) : ""}
      title={title}
      closable={!busy}
      footer={
        current && (
          <>
            {current.currentPrice ? (
              <Button
                variant="secondary"
                size="large"
                icon={<Check />}
                disabled={actionsDisabled}
                onPress={() => void handleConfirm()}
              >
                Confirmar sin cambios
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              disabled={actionsDisabled}
              onPress={() => void submit()}
            >
              Guardar el precio nuevo
            </Button>
          </>
        )
      }
    >
      {current ? (
        <div className="flex flex-col gap-4">
          {previousNotice?.tone === "success" && (
            <NotificationCard
              tone="success"
              icon={<Check />}
              title={previousNotice.title}
              description={previousNotice.description}
            />
          )}
          {previousNotice?.tone === "error" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={previousNotice.title}
              description={previousNotice.description}
            />
          )}
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo guardar el precio"
              description="Probá de nuevo."
            />
          )}
          {notice?.kind === "confirmFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo confirmar el precio"
              description="Probá de nuevo."
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(notice.retryAfterSeconds)}
            />
          )}
          {notice?.kind === "stale" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este precio cambió mientras lo mirabas"
              description="Recargá el precio actual y volvé a intentarlo."
            />
          )}
          {notice?.kind === "noPriceToConfirm" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No hay un precio para confirmar"
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice tone="error" icon={<TriangleAlert />} title="Producto desactivado" />
          )}
          {notice?.kind === "reloadFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudieron recargar los datos"
              description="Probá de nuevo."
            />
          )}
          {offersReload ? (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              disabled={busy}
              onPress={() => void handleReload()}
            >
              Recargar el precio
            </Button>
          ) : null}
          <form.AppField name="amount">
            {(field) => (
              <field.TextField
                kind="price"
                label={PRICE_LABEL[current.saleUnit]}
                prefix="$"
                required
                {...(current.currentPrice
                  ? {
                      description: `Precio actual: ${formatCentsWithUnit(current.currentPrice.unitPrice, current.saleUnit)}`,
                    }
                  : {})}
              />
            )}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}

export function PricesListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
  now,
}: PricesListScreenProps) {
  const sendToMyAccount = useSendToMyAccount();
  const {
    fetchPrices: fetchPricesService,
    setPrice: setPriceService,
    confirmPrice: confirmPriceService,
  } = services;
  const clock = now ?? (() => new Date());

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
    now: clock,
    onSessionEnded,
  });
  const readReviewQueue = useReadReviewQueue({ fetchPrices: fetchPricesService, now: clock });
  const reloadPrice = useReloadPrice({ fetchPrices: fetchPricesService, now: clock });
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
  const readAt = loaded?.readAt;

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
    {
      key: "product",
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
    },
    {
      key: "price",
      header: "Precio",
      render: (item: PriceProduct) =>
        item.currentPrice ? formatCentsWithUnit(item.currentPrice.unitPrice, item.saleUnit) : "—",
    },
    {
      key: "reviewed",
      header: "Revisado",
      render: (item: PriceProduct) =>
        readAt ? reviewedCellText(item.lastReviewedAt, readAt) : null,
    },
    {
      key: "actions",
      header: "Acciones",
      align: "end" as const,
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
    },
  ] as const;

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
          columns={columns}
          {...cloudTableState(shownData, "los precios")}
          rows={tableRows({ items: products, id: (product) => product.id }).rows}
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
        now={clock}
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
