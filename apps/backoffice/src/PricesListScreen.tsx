import {
  Button,
  IconButton,
  InlineNotice,
  ListFilter,
  Modal,
  NotificationCard,
  SearchField,
  Table,
  Tag,
  TextField,
  Tooltip,
} from "@purosur/ui";
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
import { messages } from "./messages";
import {
  type ConfirmPriceOutcome,
  confirmPrice,
  fetchPrices,
  type PriceCategory,
  type PriceProduct,
  type PriceRow,
  type PricesReviewFilter,
  type SetPriceOutcome,
  setPrice,
} from "./pricesApi";
import type { ProductSaleUnit } from "./productsApi";
import { ScreenLayout } from "./ScreenLayout";
import { sendToMyAccount } from "./settingsRoutes";

export type PricesListScreenServices = {
  fetchPrices: typeof fetchPrices;
  setPrice: typeof setPrice;
  confirmPrice: typeof confirmPrice;
};

export const defaultPricesListScreenServices: PricesListScreenServices = {
  fetchPrices,
  setPrice,
  confirmPrice,
};

export type PricesListScreenProps = {
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API. */
  services?: PricesListScreenServices;
  /** Injected in tests so review-age wording ("Nunca", "Hace N días") is deterministic. */
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

const catalogMessages = messages.catalog;
const pricesMessages = catalogMessages.prices;
const modalMessages = pricesMessages.changePriceModal;

const AMOUNT_FORMAT = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCents(cents: number): string {
  return `$ ${AMOUNT_FORMAT.format(cents / 100)}`;
}

/** "$ 7.500,00 / kg" for a per-kilo product; "$ 7.500,00" (no suffix) for a per-unit one. */
function formatCentsWithUnit(cents: number, saleUnit: ProductSaleUnit): string {
  const suffix = modalMessages.unitSuffix[saleUnit];
  return suffix ? `${formatCents(cents)} ${suffix}` : formatCents(cents);
}

// The cloud stores a unit price as a Postgres `integer` number of cents.
const MAX_UNIT_PRICE_CENTS = 2_147_483_647;

// A comma is the only decimal separator (up to two decimals); a dot is only ever a thousands
// separator, and then every group after the first has exactly three digits.
const AMOUNT_PATTERN = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

type ParsedAmount =
  | { kind: "ok"; cents: number }
  | { kind: "malformed" }
  | { kind: "notPositive" }
  | { kind: "tooLarge" };

/** Parses what a person typed as a peso amount (e.g. "7.500,50", "7500,5", "7500") into cents. */
function parseAmountInput(value: string): ParsedAmount {
  const match = AMOUNT_PATTERN.exec(value.trim());
  if (!match) {
    return { kind: "malformed" };
  }
  const whole = (match[1] ?? "").replace(/\./g, "");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const cents = Number(whole) * 100 + Number(fraction);
  if (cents <= 0) {
    return { kind: "notPositive" };
  }
  if (cents > MAX_UNIT_PRICE_CENTS) {
    return { kind: "tooLarge" };
  }
  return { kind: "ok", cents };
}

function daysSince(at: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(at).getTime()) / DAY_MS);
}

function reviewedCellText(lastReviewedAt: string | null, now: Date): string {
  if (!lastReviewedAt) {
    return pricesMessages.neverReviewed;
  }
  const days = daysSince(lastReviewedAt, now);
  return days <= 0 ? pricesMessages.reviewedToday : pricesMessages.reviewedDaysAgo({ days });
}

function modalEyebrow(product: PriceProduct, reviewWindowDays: number, now: Date): string {
  if (!product.currentPrice || !product.lastReviewedAt) {
    return modalMessages.eyebrowNoPrice;
  }
  const days = daysSince(product.lastReviewedAt, now);
  if (days >= reviewWindowDays) {
    return modalMessages.eyebrowOverdue({ days });
  }
  return days <= 0 ? modalMessages.eyebrowRecentToday : modalMessages.eyebrowRecent({ days });
}

type PriceModalOutcome =
  | { kind: "confirmed"; lastReviewedAt: string }
  | { kind: "saved"; price: PriceRow; lastReviewedAt: string };

type ModalNotice =
  | { kind: "attemptFailed" }
  | { kind: "confirmFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "stale" }
  | { kind: "notFound" }
  | { kind: "reloadFailed" };

type PriceChangeModalProps = {
  target: PriceProduct | null;
  reviewWindowDays: number;
  now: () => Date;
  onClose: () => void;
  onSessionEnded: () => void;
  onSaved: (product: PriceProduct, outcome: PriceModalOutcome) => void;
  onGone: () => void;
  fetchPrices: typeof fetchPrices;
  setPrice: typeof setPrice;
  confirmPrice: typeof confirmPrice;
};

/**
 * Sets a product's price (a new, append-only price row) or confirms its current one without a
 * change; both count as reviewing it. No passkey step-up: pricing is routine daily work.
 */
function PriceChangeModal({
  target,
  reviewWindowDays,
  now,
  onClose,
  onSessionEnded,
  onSaved,
  onGone,
  fetchPrices,
  setPrice,
  confirmPrice,
}: PriceChangeModalProps) {
  const isOpen = target !== null;
  const [current, setCurrent] = useState<PriceProduct | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  // The dialog's own title, held here (rather than read straight from `current`) so it stays a
  // non-nullable string, the same reasoning EditCategoryModal's own `title` state documents
  // (CategoriesListScreen.tsx).
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<ModalNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target) {
      setCurrent(target);
      setTitle(target.name);
      setAmount("");
      setAmountError(undefined);
      setNotice(null);
      setSubmitting(false);
    }
  }, [target]);

  function validatedAmount(): number | undefined {
    if (!amount.trim()) {
      setAmountError(modalMessages.amountRequired);
      return undefined;
    }
    const parsed = parseAmountInput(amount);
    if (parsed.kind === "malformed") {
      setAmountError(modalMessages.amountFormat);
      return undefined;
    }
    if (parsed.kind === "notPositive") {
      setAmountError(modalMessages.amountInvalid);
      return undefined;
    }
    if (parsed.kind === "tooLarge") {
      setAmountError(modalMessages.amountTooLarge);
      return undefined;
    }
    const cents = parsed.cents;
    const product = currentRef.current;
    if (product?.currentPrice && cents === product.currentPrice.unitPrice) {
      setAmountError(modalMessages.amountUnchanged);
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
      setNotice({ kind: "notFound" });
      onGone();
    } else if (outcome.kind === "stale_price") {
      setNotice({ kind: "stale" });
    } else if (outcome.kind === "price_unchanged") {
      setAmountError(modalMessages.amountUnchanged);
    } else if (outcome.kind === "validation_failed") {
      setAmountError(modalMessages.amountInvalid);
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setNotice({ kind: "attemptFailed" });
    }
    setSubmitting(false);
  }

  async function handleSave() {
    const product = currentRef.current;
    if (!product) {
      return;
    }
    const cents = validatedAmount();
    if (cents === undefined) {
      return;
    }
    setAmountError(undefined);
    setNotice(null);
    setSubmitting(true);
    const outcome = await setPrice(product.id, {
      unitPrice: cents,
      expectedCurrentPriceId: product.currentPrice?.id ?? null,
    });
    handleSetPriceOutcome(product, outcome);
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
      setNotice({ kind: "notFound" });
      onGone();
    } else if (outcome.kind === "stale_price") {
      setNotice({ kind: "stale" });
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setNotice({ kind: "confirmFailed" });
    }
    setSubmitting(false);
  }

  async function handleConfirm() {
    const product = currentRef.current;
    if (!product?.currentPrice) {
      return;
    }
    setNotice(null);
    setSubmitting(true);
    const outcome = await confirmPrice(product.id, {
      expectedCurrentPriceId: product.currentPrice.id,
    });
    handleConfirmPriceOutcome(product, outcome);
  }

  async function handleReload() {
    const product = currentRef.current;
    if (!product) {
      return;
    }
    setSubmitting(true);
    const outcome = await fetchPrices({ review: "all" });
    if (outcome.kind === "ok") {
      const fresh = outcome.value.products.find((candidate) => candidate.id === product.id);
      if (!fresh) {
        setNotice({ kind: "notFound" });
        setSubmitting(false);
        onGone();
        return;
      }
      setCurrent(fresh);
      setNotice(null);
      setSubmitting(false);
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
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "reloadFailed" });
    setSubmitting(false);
  }

  const offersReload = notice?.kind === "stale" || notice?.kind === "reloadFailed";
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
      context={current ? modalEyebrow(current, reviewWindowDays, now()) : ""}
      title={title}
      closable
      closeLabel={modalMessages.closeLabel}
      footer={
        current && (
          <>
            {current.currentPrice && (
              <Button
                variant="secondary"
                size="large"
                icon={<Check />}
                isDisabled={actionsDisabled}
                onPress={() => void handleConfirm()}
              >
                {modalMessages.confirm}
              </Button>
            )}
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              isDisabled={actionsDisabled}
              onPress={() => void handleSave()}
            >
              {modalMessages.submit}
            </Button>
          </>
        )
      }
    >
      {current && (
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.attemptFailedTitle}
              detail={modalMessages.attemptFailedDetail}
            />
          )}
          {notice?.kind === "confirmFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.confirmFailedTitle}
              detail={modalMessages.confirmFailedDetail}
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={modalMessages.rateLimitedTitle}
              detail={modalMessages.rateLimitedDetail({
                minutes: Math.ceil(notice.retryAfterSeconds / 60),
              })}
            />
          )}
          {notice?.kind === "stale" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.staleTitle}
              detail={modalMessages.staleDetail}
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.notFoundTitle}
            />
          )}
          {notice?.kind === "reloadFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.reloadFailedTitle}
              detail={modalMessages.attemptFailedDetail}
            />
          )}
          {offersReload && (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              isDisabled={submitting}
              onPress={() => void handleReload()}
            >
              {modalMessages.reload}
            </Button>
          )}
          <TextField
            kind="price"
            label={modalMessages.priceLabel[current.saleUnit]}
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
                  helperText: modalMessages.currentPriceHelper({
                    amount: formatCentsWithUnit(current.currentPrice.unitPrice, current.saleUnit),
                  }),
                }
              : {})}
            {...(amountError ? { invalid: true, errorMessage: amountError } : {})}
          />
        </div>
      )}
    </Modal>
  );
}

type ScreenNotice = { tone: "success" | "error"; title: string; detail: string };

/**
 * "Precios": every catalog product with its current price (from the branch's own price list) and
 * last review, filterable by name, category and review status. Gated by
 * `manage_prices_and_review`: App.tsx only ever routes here for someone who holds it, and a
 * `forbidden` read (a role change mid-session) sends the browser to Mi cuenta.
 */
export function PricesListScreen({ onSessionEnded, services, now }: PricesListScreenProps) {
  const {
    fetchPrices: fetchPricesService,
    setPrice: setPriceService,
    confirmPrice: confirmPriceService,
  } = services ?? defaultPricesListScreenServices;
  const clock = now ?? (() => new Date());

  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [categories, setCategories] = useState<PriceCategory[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | string>("ALL");
  const [reviewFilter, setReviewFilter] = useState<PricesReviewFilter>("pending");
  const [modalTarget, setModalTarget] = useState<PriceProduct | null>(null);
  const [walk, setWalk] = useState<{ queue: PriceProduct[]; index: number } | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const [confirmingIds, setConfirmingIds] = useState<ReadonlySet<string>>(new Set());

  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const handle = setTimeout(() => setNotice(null), NOTICE_LIFETIME_MS);
    return () => clearTimeout(handle);
  }, [notice]);

  // Only the latest load may settle the list: an earlier one still in flight would otherwise
  // overwrite it with a stale result.
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
    });
    if (thisLoad !== latestLoad.current) {
      return;
    }
    if (outcome.kind === "ok") {
      setList({
        kind: "loaded",
        products: outcome.value.products,
        pendingCount: outcome.value.pendingCount,
        reviewWindowDays: outcome.value.reviewWindowDays,
        refreshing: false,
      });
      setCategories(outcome.value.categories);
    } else if (outcome.kind === "unauthenticated") {
      onSessionEndedRef.current();
    } else if (outcome.kind === "rate_limited") {
      setList({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else {
      setList({ kind: "loadError" });
    }
  }, [fetchPricesService, reviewFilter, categoryFilter, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const products = list.kind === "loaded" ? list.products : [];
  const pendingCount = list.kind === "loaded" ? list.pendingCount : 0;
  const reviewWindowDays = list.kind === "loaded" ? list.reviewWindowDays : 30;

  const categoryFilterOptions = (() => {
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, "es"));
    return [
      { value: "ALL" as const, label: pricesMessages.categoryFilterAllOption },
      ...sorted.map((category) => ({ value: category.id, label: category.name })),
    ] as [{ value: string; label: string }, ...{ value: string; label: string }[]];
  })();

  const reviewFilterOptions = [
    { value: "pending" as const, label: pricesMessages.reviewFilterPendingOption },
    { value: "all" as const, label: pricesMessages.reviewFilterAllOption },
  ] as const;

  async function handleReviewButton() {
    const outcome = await fetchPricesService({ review: "pending" });
    if (outcome.kind === "ok") {
      if (outcome.value.products.length === 0) {
        return;
      }
      setWalk({ queue: outcome.value.products, index: 0 });
      setModalTarget(outcome.value.products[0] ?? null);
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
      setList({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    setList({ kind: "loadError" });
  }

  function handleModalSaved(product: PriceProduct, outcome: PriceModalOutcome) {
    const cents =
      outcome.kind === "saved" ? outcome.price.unitPrice : product.currentPrice?.unitPrice;
    const amount = cents !== undefined ? formatCentsWithUnit(cents, product.saleUnit) : "";
    setNotice(
      outcome.kind === "confirmed"
        ? {
            tone: "success",
            title: pricesMessages.confirmedNoticeTitle,
            detail: pricesMessages.confirmedNoticeDetail({ name: product.name, amount }),
          }
        : {
            tone: "success",
            title: pricesMessages.savedNoticeTitle,
            detail: pricesMessages.savedNoticeDetail({ name: product.name, amount }),
          },
    );
    void load();
    moveToNextInWalkOrClose();
  }

  function moveToNextInWalkOrClose() {
    if (walk) {
      const nextIndex = walk.index + 1;
      const next = walk.queue[nextIndex];
      if (next) {
        setWalk({ queue: walk.queue, index: nextIndex });
        setModalTarget(next);
        return;
      }
      setWalk(null);
    }
    setModalTarget(null);
  }

  /**
   * The modal's product was deactivated after the list loaded. Outside a walk the modal stays open
   * on its not-found notice; during one, the walk moves on and the notice moves to the screen.
   */
  function handleModalProductGone() {
    void load();
    if (walk) {
      setNotice({ tone: "error", title: modalMessages.notFoundTitle, detail: "" });
      moveToNextInWalkOrClose();
    }
  }

  function handleModalClose() {
    setWalk(null);
    setModalTarget(null);
  }

  /**
   * The table row's own "check" action: confirms without opening the Cambiar precio modal.
   * Never offered for a product with no price (see the actions column below).
   */
  async function handleRowConfirm(item: PriceProduct) {
    if (!item.currentPrice) {
      return;
    }
    setConfirmingIds((ids) => new Set(ids).add(item.id));
    const outcome = await confirmPriceService(item.id, {
      expectedCurrentPriceId: item.currentPrice.id,
    });
    setConfirmingIds((ids) => {
      const remaining = new Set(ids);
      remaining.delete(item.id);
      return remaining;
    });
    if (outcome.kind === "ok") {
      handleModalSaved(item, { kind: "confirmed", lastReviewedAt: outcome.value.lastReviewedAt });
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
      setNotice({
        tone: "error",
        title: pricesMessages.rowConfirmStaleTitle,
        detail: pricesMessages.rowConfirmStaleDetail,
      });
      void load();
      return;
    }
    if (outcome.kind === "not_found") {
      setNotice({ tone: "error", title: modalMessages.notFoundTitle, detail: "" });
      void load();
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({
        tone: "error",
        title: pricesMessages.rateLimitedTitle,
        detail: pricesMessages.rateLimitedDetail({
          minutes: Math.ceil(outcome.retryAfterSeconds / 60),
        }),
      });
      return;
    }
    setNotice({
      tone: "error",
      title: modalMessages.confirmFailedTitle,
      detail: modalMessages.confirmFailedDetail,
    });
  }

  const columns = [
    {
      key: "product",
      title: pricesMessages.columns.product,
      render: (item: PriceProduct) => (
        <div className="flex items-center gap-2">
          <span>{item.name}</span>
          {!item.currentPrice && (
            <Tag tone="neutral" icon={<Ban aria-hidden="true" />}>
              {pricesMessages.noPrice}
            </Tag>
          )}
        </div>
      ),
    },
    {
      key: "price",
      title: pricesMessages.columns.price,
      render: (item: PriceProduct) =>
        item.currentPrice
          ? formatCentsWithUnit(item.currentPrice.unitPrice, item.saleUnit)
          : pricesMessages.noPriceValue,
    },
    {
      key: "reviewed",
      title: pricesMessages.columns.reviewed,
      render: (item: PriceProduct) => reviewedCellText(item.lastReviewedAt, clock()),
    },
    {
      // Table's own `kind: "actions"` column always renders a bare IconButton with no room for a
      // Tooltip wrapper (see TableActionButton in Table.tsx), and the "check" action needs one
      // (ftdOb's tooltip). A plain data column can render whatever it likes, at the cost of a
      // visible header ("Acciones") where `kind: "actions"` would have used a visually-hidden
      // srLabel instead — an empty header fails the empty-table-header accessibility check.
      key: "actions",
      title: pricesMessages.rowActionsLabel,
      align: "end" as const,
      render: (item: PriceProduct) => (
        <div className="flex flex-row items-center justify-end gap-2">
          {item.currentPrice && (
            <Tooltip description={pricesMessages.confirmTooltip}>
              <IconButton
                icon={<Check />}
                aria-label={pricesMessages.confirmAria({ name: item.name })}
                isDisabled={confirmingIds.has(item.id)}
                onPress={() => void handleRowConfirm(item)}
              />
            </Tooltip>
          )}
          <IconButton
            icon={<Pencil />}
            aria-label={pricesMessages.editAria({ name: item.name })}
            onPress={() => setModalTarget(item)}
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
              <p className="text-ink-secondary text-sm">{pricesMessages.breadcrumb}</p>
              <h1 className="font-bold text-2xl text-brand-blue-strong">
                {pricesMessages.heading}
              </h1>
            </div>
            {pendingCount > 0 && (
              <Button
                variant="primary"
                icon={<ListChecks />}
                onPress={() => void handleReviewButton()}
              >
                {pricesMessages.reviewButton({ count: pendingCount })}
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
              title={pricesMessages.loadErrorTitle}
              detail={pricesMessages.loadErrorDetail}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {pricesMessages.retry}
            </Button>
          </>
        )}
        {list.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={pricesMessages.rateLimitedTitle}
              detail={pricesMessages.rateLimitedDetail({
                minutes: Math.ceil(list.retryAfterSeconds / 60),
              })}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {pricesMessages.retry}
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
                  onChange={setSearch}
                  placeholder={pricesMessages.searchPlaceholder}
                  icon={<Search />}
                />
              </div>
              <ListFilter
                label={pricesMessages.categoryFilterLabel}
                options={categoryFilterOptions}
                value={categoryFilter}
                onChange={setCategoryFilter}
              />
              <ListFilter
                label={pricesMessages.reviewFilterLabel}
                options={reviewFilterOptions}
                value={reviewFilter}
                onChange={setReviewFilter}
              />
            </div>
            <Table
              aria-label={pricesMessages.heading}
              columns={columns}
              loading={list.kind === "loading" ? "initial" : list.refreshing ? "updating" : false}
              rows={products.map((product) => ({ id: product.id, item: product }))}
              empty={
                reviewFilter === "pending" && pendingCount === 0
                  ? {
                      icon: <BadgeCheck />,
                      title: pricesMessages.emptyPendingTitle,
                      detail: pricesMessages.emptyPendingDetail({ days: reviewWindowDays }),
                      tone: "blank",
                    }
                  : {
                      icon: <Search />,
                      title: pricesMessages.noResultsTitle,
                      detail: pricesMessages.noResultsDetail,
                      tone: "filtered",
                    }
              }
              footer={
                <p className="text-ink-secondary text-sm">
                  {reviewFilter === "pending"
                    ? pricesMessages.footerPending({ count: products.length })
                    : pricesMessages.footerAll({ count: products.length })}
                </p>
              }
            />
          </>
        )}
      </ScreenLayout>
      <PriceChangeModal
        target={modalTarget}
        reviewWindowDays={reviewWindowDays}
        now={clock}
        onClose={handleModalClose}
        onSessionEnded={onSessionEnded}
        onSaved={handleModalSaved}
        onGone={handleModalProductGone}
        fetchPrices={fetchPricesService}
        setPrice={setPriceService}
        confirmPrice={confirmPriceService}
      />
      {notice && (
        <div className="fixed right-6 bottom-6 z-50">
          <NotificationCard
            tone={notice.tone}
            icon={notice.tone === "success" ? <Check /> : <TriangleAlert />}
            title={notice.title}
            detail={notice.detail}
            floating
          />
        </div>
      )}
    </>
  );
}
