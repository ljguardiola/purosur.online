import {
  Button,
  IconButton,
  InlineNotice,
  ListFilter,
  Modal,
  NotificationCard,
  plural,
  SearchField,
  Table,
  Tag,
  TextField,
  Tooltip,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
import {
  BadgeCheck,
  Ban,
  Check,
  ListChecks,
  Pencil,
  RotateCcw,
  Search,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSendToMyAccount } from "../access/send-to-my-account";
import type { ProductSaleUnit } from "../catalog/products-api";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useLatestRef } from "../platform/use-latest-ref";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { formatCents, MAX_UNIT_PRICE_CENTS, parseAmountInput } from "./money";
import {
  type ConfirmPriceOutcome,
  confirmPrice,
  type FetchPricesOutcome,
  fetchPrices,
  type PriceCategory,
  type PriceProduct,
  type PriceRow,
  type PricesReviewFilter,
  type SetPriceOutcome,
  setPrice,
} from "./prices-api";
import type { PricesListFilters } from "./routes";

export type PricesListScreenServices = {
  fetchPrices: typeof fetchPrices;
  setPrice: typeof setPrice;
  confirmPrice: typeof confirmPrice;
};

const defaultPricesListScreenServices: PricesListScreenServices = {
  fetchPrices,
  setPrice,
  confirmPrice,
};

export type PricesListScreenProps = {
  filters: PricesListFilters;
  onFiltersChange: (filters: PricesListFilters) => void;
  onSessionEnded: () => void;
  services?: PricesListScreenServices | undefined;
  now?: () => Date;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | {
      kind: "loaded";
      products: PriceProduct[];
      pendingCount: number;
      reviewWindowDays: number;
      refreshing: boolean;
    };

const DAY_MS = 24 * 60 * 60 * 1000;
const NOTICE_LIFETIME_MS = 5000;
const SEARCH_DEBOUNCE_MS = 300;

const AMOUNT_INVALID = "Ingresá un precio válido, mayor a cero.";
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

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Calendar days in the browser's own timezone; rounding absorbs a daylight-saving day's 23 or 25 hours. */
function daysSince(at: string, now: Date): number {
  return Math.round((startOfLocalDay(now) - startOfLocalDay(new Date(at))) / DAY_MS);
}

function reviewedCellText(lastReviewedAt: string | null, now: Date): string {
  if (!lastReviewedAt) {
    return "Nunca";
  }
  const days = daysSince(lastReviewedAt, now);
  return days <= 0 ? "Hoy" : plural(days, { one: "Hace 1 día", other: `Hace ${days} días` });
}

function eyebrowOverdue(days: number): string {
  return plural(days, { one: "SIN REVISAR HACE 1 DÍA", other: `SIN REVISAR HACE ${days} DÍAS` });
}

function eyebrowRecent(days: number): string {
  return plural(days, { one: "REVISADO HACE 1 DÍA", other: `REVISADO HACE ${days} DÍAS` });
}

function modalEyebrow(product: PriceProduct, now: Date): string {
  if (!product.currentPrice || !product.lastReviewedAt) {
    return "SIN PRECIO";
  }
  const days = daysSince(product.lastReviewedAt, now);
  if (days <= 0) {
    return "REVISADO HOY";
  }
  return product.pending ? eyebrowOverdue(days) : eyebrowRecent(days);
}

function emptyPendingDetail(params: { days: number }): string {
  return plural(params.days, {
    one: "Todos los precios se revisaron en el último día.",
    other: `Todos los precios se revisaron en los últimos ${params.days} días.`,
  });
}

type PriceModalOutcome =
  | { kind: "confirmed"; lastReviewedAt: string }
  | { kind: "saved"; price: PriceRow; lastReviewedAt: string };

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
  detail: string;
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
  fetchPrices: typeof fetchPrices;
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
  fetchPrices,
  setPrice,
  confirmPrice,
}: PriceChangeModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const isOpen = target !== null;
  const [current, setCurrent] = useState<PriceProduct | null>(null);
  const [shownAt, setShownAt] = useState<Date | null>(null);
  const nowRef = useLatestRef(now);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<ModalNotice | null>(null);
  const [previousNotice, setPreviousNotice] = useState<ScreenNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function showNotice(ownNotice: ModalNotice) {
    setNotice(ownNotice);
    setPreviousNotice(null);
  }

  function showAmountError(error: string) {
    setAmountError(error);
    setPreviousNotice(null);
  }

  function startRequest() {
    setNotice(null);
    setPreviousNotice(null);
    setSubmitting(true);
  }

  useEffect(() => {
    if (target) {
      setCurrent(target);
      setShownAt(nowRef.current());
      setTitle(target.name);
      setAmount("");
      setAmountError(undefined);
      setNotice(null);
      setPreviousNotice(previousProductNotice);
      setSubmitting(false);
    }
  }, [target, previousProductNotice, nowRef]);

  function validatedAmount(product: PriceProduct): number | undefined {
    if (!amount.trim()) {
      showAmountError("Ingresá el precio nuevo.");
      return undefined;
    }
    const parsed = parseAmountInput(amount);
    if (parsed.kind === "malformed") {
      showAmountError("Escribí el precio con coma para los decimales, por ejemplo 7.500,50.");
      return undefined;
    }
    if (parsed.kind === "notPositive") {
      showAmountError(AMOUNT_INVALID);
      return undefined;
    }
    if (parsed.kind === "tooLarge") {
      showAmountError(`Ingresá un precio de hasta ${formatCents(MAX_UNIT_PRICE_CENTS)}.`);
      return undefined;
    }
    const cents = parsed.cents;
    if (product.currentPrice && cents === product.currentPrice.unitPrice) {
      showAmountError(AMOUNT_UNCHANGED);
      return undefined;
    }
    return cents;
  }

  function handleSetPriceOutcome(product: PriceProduct, outcome: SetPriceOutcome) {
    if (outcome.kind === "ok") {
      onSaved(product, {
        kind: "saved",
        price: outcome.value.price,
        lastReviewedAt: outcome.value.lastReviewedAt,
      });
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
      showAmountError(AMOUNT_UNCHANGED);
    } else if (outcome.kind === "validation_failed" && outcome.field === "expectedCurrentPriceId") {
      showNotice({ kind: "stale" });
    } else if (outcome.kind === "validation_failed") {
      showAmountError(AMOUNT_INVALID);
    } else if (outcome.kind === "rate_limited") {
      showNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      showNotice({ kind: "attemptFailed" });
    }
  }

  async function handleSave() {
    const product = current;
    if (!product) {
      return;
    }
    const cents = validatedAmount(product);
    if (cents === undefined) {
      return;
    }
    setAmountError(undefined);
    startRequest();
    const expectedCurrentPriceId = product.currentPrice?.id ?? null;
    try {
      const outcome = await setPrice(product.id, {
        unitPrice: cents,
        expectedCurrentPriceId,
      });
      handleSetPriceOutcome(product, outcome);
    } catch {
      showNotice({ kind: "attemptFailed" });
    }
    setSubmitting(false);
  }

  function handleConfirmPriceOutcome(product: PriceProduct, outcome: ConfirmPriceOutcome) {
    if (outcome.kind === "ok") {
      onSaved(product, { kind: "confirmed", lastReviewedAt: outcome.value.lastReviewedAt });
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
    setSubmitting(false);
  }

  async function handleReload() {
    const product = current;
    if (!product) {
      return;
    }
    setPreviousNotice(null);
    setSubmitting(true);
    try {
      const outcome = await fetchPrices({ review: "all" });
      handleReloadOutcome(product, outcome);
    } catch {
      showNotice({ kind: "reloadFailed" });
    }
    setSubmitting(false);
  }

  function handleReloadOutcome(product: PriceProduct, outcome: FetchPricesOutcome) {
    if (outcome.kind === "ok") {
      const fresh = outcome.value.products.find((candidate) => candidate.id === product.id);
      if (!fresh) {
        showNotice({ kind: "notFound" });
        onGone(product);
        return;
      }
      setCurrent(fresh);
      setShownAt(now());
      setNotice(null);
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
  const actionsDisabled = submitting || notice?.kind === "notFound";

  return (
    <Modal
      isOpen={isOpen}
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
      closable={!submitting}
      footer={
        current && (
          <>
            {current.currentPrice ? (
              <Button
                variant="secondary"
                size="large"
                icon={<Check />}
                isDisabled={actionsDisabled}
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
              isDisabled={actionsDisabled}
              onPress={() => void handleSave()}
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
              detail={previousNotice.detail}
            />
          )}
          {previousNotice?.tone === "error" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={previousNotice.title}
              detail={previousNotice.detail}
            />
          )}
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo guardar el precio"
              detail="Probá de nuevo."
            />
          )}
          {notice?.kind === "confirmFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo confirmar el precio"
              detail="Probá de nuevo."
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              detail={retryAfterDetail(notice.retryAfterSeconds)}
            />
          )}
          {notice?.kind === "stale" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este precio cambió mientras lo mirabas"
              detail="Recargá el precio actual y volvé a intentarlo."
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
              detail="Probá de nuevo."
            />
          )}
          {offersReload ? (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              isDisabled={submitting}
              onPress={() => void handleReload()}
            >
              Recargar el precio
            </Button>
          ) : null}
          <TextField
            kind="price"
            label={PRICE_LABEL[current.saleUnit]}
            prefix="$"
            value={amount}
            onChange={(value) => {
              setAmount(value);
              if (amountError) {
                setAmountError(undefined);
              }
            }}
            required
            {...(current.currentPrice
              ? {
                  helperText: `Precio actual: ${formatCentsWithUnit(current.currentPrice.unitPrice, current.saleUnit)}`,
                }
              : {})}
            {...(amountError ? { invalid: true, errorMessage: amountError } : {})}
          />
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
  } = services ?? defaultPricesListScreenServices;
  const clock = now ?? (() => new Date());

  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [loadedAt, setLoadedAt] = useState(() => clock());
  const [categories, setCategories] = useState<PriceCategory[]>([]);
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

  const onSessionEndedRef = useLatestRef(onSessionEnded);
  const onFiltersChangeRef = useLatestRef(onFiltersChange);
  const clockRef = useLatestRef(clock);

  useEffect(() => {
    const shown: PricesListFilters = { search, category: categoryFilter, review: reviewFilter };
    if (!deepEqual(shown, filters)) {
      onFiltersChangeRef.current(shown);
    }
  }, [search, categoryFilter, reviewFilter, filters, onFiltersChangeRef]);

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

  useEffect(() => {
    const lifetimeMs =
      notice?.tone === "success"
        ? NOTICE_LIFETIME_MS
        : notice?.retryAfterSeconds !== undefined
          ? notice.retryAfterSeconds * 1000
          : undefined;
    if (lifetimeMs === undefined) {
      return;
    }
    const handle = setTimeout(() => setNotice(null), lifetimeMs);
    return () => clearTimeout(handle);
  }, [notice]);

  function clearErrorNotice() {
    setNotice((shown) => (shown?.tone === "error" ? null : shown));
  }

  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    latestLoad.current += 1;
    const thisLoad = latestLoad.current;
    setList((previous) =>
      previous.kind === "loaded" ? { ...previous, refreshing: true } : { kind: "loading" },
    );
    const outcome = await fetchPricesService({
      review: reviewFilter,
      ...(categoryFilter !== "ALL" ? { categoryId: categoryFilter } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    }).catch((): FetchPricesOutcome => ({ kind: "failed" }));
    if (thisLoad !== latestLoad.current) {
      return;
    }
    if (outcome.kind === "ok") {
      setLoadedAt(clockRef.current());
      setList({
        kind: "loaded",
        products: outcome.value.products,
        pendingCount: outcome.value.pendingCount,
        reviewWindowDays: outcome.value.reviewWindowDays,
        refreshing: false,
      });
      const offeredIds = new Set(outcome.value.categories.map(({ id }) => id));
      setCategories(outcome.value.categories);
      setCategoryFilter((shown) => (shown === "ALL" || offeredIds.has(shown) ? shown : "ALL"));
    } else if (outcome.kind === "unauthenticated") {
      onSessionEndedRef.current();
    } else if (outcome.kind === "rate_limited") {
      setList({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else {
      setList({ kind: "loadError" });
    }
  }, [
    fetchPricesService,
    reviewFilter,
    categoryFilter,
    debouncedSearch,
    sendToMyAccount,
    onSessionEndedRef,
    clockRef,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadRef = useLatestRef(load);
  const reviewFilterRef = useLatestRef(reviewFilter);
  function reloadWithCurrentFilters() {
    void loadRef.current();
  }

  function handleRetry() {
    clearErrorNotice();
    void load();
  }

  const products = list.kind === "loaded" ? list.products : [];
  const pendingCount = list.kind === "loaded" ? list.pendingCount : 0;
  const reviewWindowDays = list.kind === "loaded" ? list.reviewWindowDays : 30;

  const categoryFilterOptions = (() => {
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, "es"));
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
    detail: "Probá de nuevo.",
  };

  function rateLimitedNotice(retryAfterSeconds: number): ScreenNotice {
    return {
      tone: "error",
      title: "Demasiadas solicitudes",
      detail: retryAfterDetail(retryAfterSeconds),
      retryAfterSeconds,
    };
  }

  async function handleReviewButton() {
    clearErrorNotice();
    setScreenRequestInFlight(true);
    try {
      handleReviewReadOutcome(await fetchPricesService({ review: "pending" }));
    } catch {
      showScreenNotice(reviewStartFailedNotice);
    }
    setScreenRequestInFlight(false);
  }

  function handleReviewReadOutcome(outcome: FetchPricesOutcome) {
    if (outcome.kind === "ok") {
      const [first] = outcome.value.products;
      if (!first) {
        reloadWithCurrentFilters();
        if (reviewFilterRef.current !== "pending") {
          showScreenNotice({
            tone: "success",
            title: "No quedan precios por revisar",
            detail: emptyPendingDetail({ days: outcome.value.reviewWindowDays }),
          });
        }
        return;
      }
      setWalk({ queue: outcome.value.products, index: 0 });
      setModal({ target: first, previousProductNotice: null });
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEndedRef.current();
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
    const cents =
      outcome.kind === "saved" ? outcome.price.unitPrice : product.currentPrice?.unitPrice;
    const amount = cents !== undefined ? formatCentsWithUnit(cents, product.saleUnit) : "";
    return outcome.kind === "confirmed"
      ? {
          tone: "success",
          title: "Precio confirmado",
          detail: `${product.name} sigue a ${amount}.`,
        }
      : {
          tone: "success",
          title: "Precio actualizado",
          detail: `${product.name} pasa a ${amount}.`,
        };
  }

  function goneNotice(product: PriceProduct): ScreenNotice {
    return {
      tone: "error",
      title: "Producto desactivado",
      detail: `${product.name} ya no está en el catálogo.`,
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
    reloadWithCurrentFilters();
    moveToNextInWalkOrClose(reviewedNotice(product, outcome));
  }

  function handleModalProductGone(product: PriceProduct) {
    reloadWithCurrentFilters();
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
      detail: "Probá de nuevo.",
    };
  }

  function handleRowConfirmOutcome(item: PriceProduct, outcome: ConfirmPriceOutcome) {
    if (outcome.kind === "ok") {
      reloadWithCurrentFilters();
      showScreenNotice(
        reviewedNotice(item, { kind: "confirmed", lastReviewedAt: outcome.value.lastReviewedAt }),
      );
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEndedRef.current();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "stale_price") {
      reloadWithCurrentFilters();
      showScreenNotice({
        tone: "error",
        title: "El precio cambió recién",
        detail: `Revisá el precio actual de ${item.name}.`,
      });
      return;
    }
    if (outcome.kind === "not_found") {
      reloadWithCurrentFilters();
      showScreenNotice(goneNotice(item));
      return;
    }
    if (outcome.kind === "no_price_to_confirm") {
      reloadWithCurrentFilters();
      showScreenNotice({
        tone: "error",
        title: "No hay un precio para confirmar",
        detail: `${item.name} todavía no tiene precio.`,
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
      title: "PRODUCTO",
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
      title: "PRECIO",
      render: (item: PriceProduct) =>
        item.currentPrice ? formatCentsWithUnit(item.currentPrice.unitPrice, item.saleUnit) : "—",
    },
    {
      key: "reviewed",
      title: "REVISADO",
      render: (item: PriceProduct) => reviewedCellText(item.lastReviewedAt, loadedAt),
    },
    {
      key: "actions",
      title: "Acciones",
      align: "end" as const,
      render: (item: PriceProduct) => (
        <div className="flex flex-row items-center justify-end gap-2">
          {item.currentPrice ? (
            <Tooltip description="Confirmar sin cambios: cuenta como revisar el precio.">
              <IconButton
                icon={<Check />}
                aria-label={`Confirmar el precio de ${item.name} sin cambios`}
                isDisabled={screenRequestInFlight}
                onPress={() => void handleRowConfirm(item)}
              />
            </Tooltip>
          ) : null}
          <IconButton
            icon={<Pencil />}
            aria-label={`Cambiar el precio de ${item.name}`}
            isDisabled={screenRequestInFlight}
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
          <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
            <div className="flex flex-col justify-center">
              <p className="text-ink-secondary text-sm">Catálogo</p>
              <ScreenTitle>Precios</ScreenTitle>
            </div>
            {pendingCount > 0 && (
              <Button
                variant="primary"
                icon={<ListChecks />}
                isDisabled={screenRequestInFlight}
                onPress={() => void handleReviewButton()}
              >
                {plural(pendingCount, { one: "Revisar 1", other: `Revisar los ${pendingCount}` })}
              </Button>
            )}
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {list.kind === "loadError" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No pudimos abrir los precios"
              detail="Probá de nuevo en unos minutos."
            />
            <Button variant="secondary" onPress={handleRetry}>
              Reintentar
            </Button>
          </>
        )}
        {list.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              detail={retryAfterDetail(list.retryAfterSeconds)}
            />
            <Button variant="secondary" onPress={handleRetry}>
              Reintentar
            </Button>
          </>
        )}
        {(list.kind === "loading" || list.kind === "loaded") && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-[26.25rem]">
                <SearchField
                  variant="backoffice"
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
              loading={list.kind === "loading" ? "initial" : list.refreshing ? "updating" : false}
              rows={products.map((product) => ({ id: product.id, item: product }))}
              empty={
                reviewFilter === "pending" && pendingCount === 0
                  ? {
                      icon: <BadgeCheck />,
                      title: "Precios al día",
                      detail: emptyPendingDetail({ days: reviewWindowDays }),
                      tone: "blank",
                    }
                  : {
                      icon: <Search />,
                      title: "Sin resultados",
                      detail: "Probá con otro nombre o categoría.",
                      tone: "filtered",
                    }
              }
              footer={
                <p className="text-ink-secondary text-sm">
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
              }
            />
          </>
        )}
      </ScreenLayout>
      <PriceChangeModal
        target={modal?.target ?? null}
        previousProductNotice={modal?.previousProductNotice ?? null}
        now={clock}
        onClose={handleModalClose}
        onSessionEnded={onSessionEnded}
        onSaved={handleModalSaved}
        onGone={handleModalProductGone}
        fetchPrices={fetchPricesService}
        setPrice={setPriceService}
        confirmPrice={confirmPriceService}
      />
      {notice ? (
        <div className="fixed right-6 bottom-6 z-50">
          <NotificationCard
            key={notice.id}
            tone={notice.tone}
            icon={notice.tone === "success" ? <Check /> : <TriangleAlert />}
            title={notice.title}
            detail={notice.detail}
            floating
          />
        </div>
      ) : null}
    </>
  );
}
