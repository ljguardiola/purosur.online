import {
  BARCODE_MAX_LENGTH,
  barcodeLength,
  ean13Modules,
  isInternalBarcode,
  LABELS_MAX_COUNT_PER_PRODUCT,
  LABELS_MAX_TOTAL_COUNT,
  PRODUCT_BARCODES_MAX_COUNT,
  PRODUCT_NAME_MAX_LENGTH,
  productNameLength,
} from "@purosur/contracts";
import {
  Button,
  IconButton,
  InlineNotice,
  ListFilter,
  Modal,
  OptionCardGroup,
  SearchField,
  Select,
  type SelectOption,
  StatusIndicator,
  Table,
  type TableSort,
  TextField,
} from "@purosur/ui";
import {
  Ban,
  Barcode,
  Check,
  Download,
  Minus,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Scale,
  ScanBarcode,
  Search,
  SearchX,
  ShieldX,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { type CategorySummary, fetchCategories } from "./categoriesApi";
import { messages } from "./messages";
import {
  type CreateProductInput,
  createProduct,
  deactivateProduct,
  editProduct,
  fetchProducts,
  generateInternalBarcode,
  type ProductSaleUnit,
  type ProductStatusFilter,
  type ProductSummary,
  printLabels,
} from "./productsApi";
import { ScreenLayout } from "./ScreenLayout";
import { sendToMyAccount } from "./settingsRoutes";

export type ProductsListScreenServices = {
  fetchProducts: typeof fetchProducts;
  createProduct: typeof createProduct;
  editProduct: typeof editProduct;
  deactivateProduct: typeof deactivateProduct;
  fetchCategories: typeof fetchCategories;
  generateInternalBarcode: typeof generateInternalBarcode;
  printLabels: typeof printLabels;
};

export const defaultProductsListScreenServices: ProductsListScreenServices = {
  fetchProducts,
  createProduct,
  editProduct,
  deactivateProduct,
  fetchCategories,
  generateInternalBarcode,
  printLabels,
};

export type ProductsListScreenProps = {
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API. */
  services?: ProductsListScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; products: ProductSummary[] };

type CategoryFilter = "ALL" | string;
type UnitFilter = "ALL" | ProductSaleUnit;

const catalogMessages = messages.catalog;
const productsMessages = catalogMessages.products;

function unitLabel(saleUnit: ProductSaleUnit): string {
  return productsMessages.unitOptionLabels[saleUnit];
}

function nameCollator(a: ProductSummary, b: ProductSummary): number {
  return a.name.localeCompare(b.name, "es");
}

function sortedByName(products: ProductSummary[], direction: "ascending" | "descending") {
  const sorted = [...products].sort(nameCollator);
  return direction === "ascending" ? sorted : sorted.reverse();
}

function categorySelectOptions(
  categories: CategorySummary[],
): [SelectOption<string>, ...SelectOption<string>[]] | undefined {
  if (categories.length === 0) {
    return undefined;
  }
  const [first, ...rest] = [...categories]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((category) => ({ value: category.id, label: category.name }));
  if (!first) {
    throw new Error("no category to offer: categories.length > 0 was already checked");
  }
  return [first, ...rest];
}

function productNameError(
  name: string,
  modalMessages: { nameRequired: string; nameTooLong: string },
) {
  const trimmed = name.trim();
  if (!trimmed) {
    return modalMessages.nameRequired;
  }
  if (productNameLength(trimmed) > PRODUCT_NAME_MAX_LENGTH) {
    return modalMessages.nameTooLong;
  }
  return undefined;
}

// Same asterisk, size and color TextField's and Select's own backoffice label draw on a required
// field's own label.
const requiredLabelClassName = "text-sm font-bold text-ink after:ml-1 after:content-['*']";

// Shared by the scan input and the "Generar código interno" button: the design's own outlined
// control (2px inner stroke, centered 18px icon + 16px/700 label, both in brand blue).
const barcodeActionClassName =
  "flex h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-base font-bold " +
  "text-brand-blue-strong shadow-[inset_0_0_0_2px_var(--color-brand-blue-ui)] " +
  "outline-none transition-[background-color]";

// packages/ui Button's own focus ring. `outline-none` also clears the outline style, so the ring
// needs `outline-solid` back to show at all. The scan control's ring sits on the whole control,
// lit by the input inside it.
const scanControlClassName =
  `${barcodeActionClassName} relative min-w-0 cursor-text hover:bg-surface-bone ` +
  "focus-within:outline-[3px] focus-within:outline-solid focus-within:outline-offset-3 " +
  "focus-within:outline-brand-blue-strong";

// `enabled:` keeps the hover fill off a disabled button, as packages/ui Button does.
const generateButtonClassName =
  `${barcodeActionClassName} enabled:hover:bg-surface-bone ` +
  "focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-3 " +
  "focus-visible:outline-brand-blue-strong disabled:opacity-[0.45]";

type BarcodeChipsProps = {
  barcodes: string[];
  onRemove: (code: string) => void;
  scanInput: string;
  onScanInputChange: (value: string) => void;
  onScanKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onGenerate: () => void;
  generateDisabled: boolean;
  labels: {
    barcodesLabel: string;
    scanInputLabel: string;
    generateButtonLabel: string;
    barcodeRemoveAria: (params: { code: string }) => string;
  };
  error: string | undefined;
  scanError: string | undefined;
  generateError: string | undefined;
};

function BarcodeChips({
  barcodes,
  onRemove,
  scanInput,
  onScanInputChange,
  onScanKeyDown,
  onGenerate,
  generateDisabled,
  labels,
  error,
  scanError,
  generateError,
}: BarcodeChipsProps) {
  const scanErrorId = useId();
  const errorId = useId();
  const generateErrorId = useId();
  const [scanFocused, setScanFocused] = useState(false);
  const describedBy = [scanError && scanErrorId, error && errorId].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1">
      <span className={requiredLabelClassName}>{labels.barcodesLabel}</span>
      {barcodes.length > 0 && (
        <div className="flex flex-col gap-1">
          {barcodes.map((code) => (
            <div
              key={code}
              className="flex h-11 items-center gap-2 rounded-lg bg-surface-bone px-3"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{code}</span>
              <IconButton
                icon={<X />}
                aria-label={labels.barcodeRemoveAria({ code })}
                onPress={() => onRemove(code)}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        {/* The input fills the whole control for clicks and typing, with its text centered; while
            it is empty, the icon and the placeholder text sit under it as one centered group, which
            a native placeholder can't do without the input sizing itself to its content. Focus
            hides the group too, leaving just the centered caret. */}
        <label className={scanControlClassName}>
          {!scanInput && !scanFocused && (
            <span
              aria-hidden="true"
              className="pointer-events-none flex min-w-0 items-center justify-center gap-2"
            >
              <ScanBarcode className="size-[1.125rem] shrink-0" />
              <span className="truncate">{labels.scanInputLabel}</span>
            </span>
          )}
          <input
            className="absolute inset-0 size-full rounded-lg bg-transparent px-3 text-center outline-none"
            value={scanInput}
            onChange={(event) => onScanInputChange(event.target.value)}
            onKeyDown={onScanKeyDown}
            onFocus={() => setScanFocused(true)}
            onBlur={() => setScanFocused(false)}
            aria-label={labels.scanInputLabel}
            aria-invalid={describedBy ? true : undefined}
            aria-describedby={describedBy || undefined}
          />
        </label>
        <button
          type="button"
          className={generateButtonClassName}
          disabled={generateDisabled}
          onClick={onGenerate}
          aria-describedby={generateError ? generateErrorId : undefined}
        >
          <Barcode aria-hidden="true" className="size-[1.125rem] shrink-0" />
          <span className="truncate">{labels.generateButtonLabel}</span>
        </button>
      </div>
      {generateError && (
        <span
          id={generateErrorId}
          role="alert"
          className="text-sm font-normal text-status-error-ui"
        >
          {generateError}
        </span>
      )}
      {scanError && (
        <span id={scanErrorId} className="text-sm font-normal text-status-error-ui">
          {scanError}
        </span>
      )}
      {error && (
        <span id={errorId} className="text-sm font-normal text-status-error-ui">
          {error}
        </span>
      )}
    </div>
  );
}

type ProductFieldErrors = { name?: string; category?: string; unit?: string; barcodes?: string };
type ProductFieldErrorKey = keyof ProductFieldErrors;

// Deletes the key rather than setting it to `undefined`, since `exactOptionalPropertyTypes`
// treats an explicit `undefined` value as different from the key being absent (mirrors
// UsersListScreen.tsx's own withFieldError).
function withFieldError(
  current: ProductFieldErrors,
  field: ProductFieldErrorKey,
  message: string | undefined,
): ProductFieldErrors {
  const rest = { ...current };
  delete rest[field];
  return message !== undefined ? { ...rest, [field]: message } : rest;
}

function productFieldErrors(
  name: string | undefined,
  category: string | undefined,
  unit: string | undefined,
  barcodes: string | undefined,
): ProductFieldErrors {
  let next: ProductFieldErrors = {};
  next = withFieldError(next, "name", name);
  next = withFieldError(next, "category", category);
  next = withFieldError(next, "unit", unit);
  next = withFieldError(next, "barcodes", barcodes);
  return next;
}

type PendingCodeResult = { ok: true; barcodes: string[]; added: boolean } | { ok: false };

type ScanMessages = {
  barcodeHasSpaces: string;
  barcodeTooLong: string;
  barcodeAlreadyListed: string;
  barcodeLimitReached: string;
};

function scanErrorFor(
  code: string,
  listed: string[],
  scanMessages: ScanMessages,
): string | undefined {
  if (/\s/.test(code)) {
    return scanMessages.barcodeHasSpaces;
  }
  if (barcodeLength(code) > BARCODE_MAX_LENGTH) {
    return scanMessages.barcodeTooLong;
  }
  if (listed.includes(code)) {
    return scanMessages.barcodeAlreadyListed;
  }
  if (listed.length >= PRODUCT_BARCODES_MAX_COUNT) {
    return scanMessages.barcodeLimitReached;
  }
  return undefined;
}

function barcodesRejectedError(
  sent: string[],
  modalMessages: { barcodeRequired: string; barcodeInvalid: string },
): string {
  return sent.length > 0 ? modalMessages.barcodeInvalid : modalMessages.barcodeRequired;
}

function barcodeTakenError(
  codes: string[],
  modalMessages: {
    barcodeTaken: (params: { codes: string[] }) => string;
    barcodeTakenUnnamed: string;
  },
): string {
  return codes.length > 0
    ? modalMessages.barcodeTaken({ codes })
    : modalMessages.barcodeTakenUnnamed;
}

function hasInternalBarcode(barcodes: string[]): boolean {
  return barcodes.some(isInternalBarcode);
}

function useBarcodeChips(initial: string[], scanMessages: ScanMessages) {
  const [barcodes, setBarcodes] = useState<string[]>(initial);
  const barcodesRef = useRef(barcodes);
  barcodesRef.current = barcodes;
  const [scanInput, setScanInput] = useState("");
  const [scanError, setScanError] = useState<string | undefined>(undefined);

  // Stable across renders (its own deps are only the setState setters, themselves stable), so a
  // caller's effect can list it as a dependency without re-running on every render.
  const reset = useCallback((next: string[]) => {
    setBarcodes(next);
    setScanInput("");
    setScanError(undefined);
  }, []);

  // A scan error describes the code as last confirmed against the list as it stood, so any change
  // to either makes it stale.
  function changeScanInput(value: string) {
    setScanInput(value);
    setScanError(undefined);
  }

  // Re-checks a shown error against the shorter list: removing a chip can lift the limit or
  // unlist a duplicate, but a code with spaces or too long is still wrong.
  function remove(code: string) {
    const next = barcodes.filter((existing) => existing !== code);
    setBarcodes(next);
    setScanError((current) =>
      current === undefined ? undefined : scanErrorFor(scanInput.trim(), next, scanMessages),
    );
  }

  // Adds the code still sitting in the scan input, if any, and returns the list as it stands
  // once added, since the state update isn't readable until the next render.
  function commitPending(): PendingCodeResult {
    const trimmed = scanInput.trim();
    if (!trimmed) {
      return { ok: true, barcodes, added: false };
    }
    const error = scanErrorFor(trimmed, barcodes, scanMessages);
    if (error) {
      setScanError(error);
      return { ok: false };
    }
    const next = [...barcodes, trimmed];
    setBarcodes(next);
    setScanInput("");
    setScanError(undefined);
    return { ok: true, barcodes: next, added: true };
  }

  function handleScanKeyDown(event: KeyboardEvent<HTMLInputElement>, onAdded: () => void) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const result = commitPending();
    if (result.ok && result.added) {
      onAdded();
    }
  }

  // Shows the shared 20-code cap before a code is allocated, so a full list never burns one.
  function refuseWhenFull(): boolean {
    if (barcodes.length < PRODUCT_BARCODES_MAX_COUNT) {
      return false;
    }
    setScanError(scanMessages.barcodeLimitReached);
    return true;
  }

  // Adds a code the cloud already allocated and confirmed unique, so unlike a scanned code it
  // skips the spaces/length checks. It lands after a request, so it appends to the list as it
  // stands by then (codes scanned or removed meanwhile), still under the shared 20-code cap.
  function addGenerated(code: string): boolean {
    if (barcodesRef.current.length >= PRODUCT_BARCODES_MAX_COUNT) {
      setScanError(scanMessages.barcodeLimitReached);
      return false;
    }
    setBarcodes((current) => (current.includes(code) ? current : [...current, code]));
    return true;
  }

  return {
    barcodes,
    scanInput,
    changeScanInput,
    scanError,
    reset,
    remove,
    commitPending,
    handleScanKeyDown,
    refuseWhenFull,
    addGenerated,
  };
}

/**
 * Drives the "Generar código interno" button shared by the create and edit modals: allocates a
 * code from the cloud and adds it like a scanned one, or reports the outcome the same way the
 * rest of the modal's own submit does (session end, forbidden, or an inline failure that leaves
 * whatever is already listed untouched).
 */
function useGenerateInternalBarcode(
  chips: Pick<ReturnType<typeof useBarcodeChips>, "barcodes" | "refuseWhenFull" | "addGenerated">,
  generateInternalBarcodeService: typeof generateInternalBarcode,
  onSessionEnded: () => void,
  clearBarcodesFieldError: () => void,
  onRateLimited: (retryAfterSeconds: number) => void,
  clearRateLimited: () => void,
  generateFailedMessage: string,
) {
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | undefined>(undefined);
  // Bumped by every reset (the modal reopening, moving to another product, or reloading it), so a
  // response still in flight from before can tell it no longer belongs to the form on screen.
  const requestIdRef = useRef(0);

  // Stable across renders, like useBarcodeChips's own reset, so a caller's effect can list it as
  // a dependency without re-running on every render.
  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setGenerating(false);
    setGenerateError(undefined);
  }, []);

  async function handleGenerate() {
    setGenerateError(undefined);
    clearRateLimited();
    if (chips.refuseWhenFull()) {
      return;
    }
    setGenerating(true);
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const outcome = await generateInternalBarcodeService();
    if (requestId !== requestIdRef.current) {
      return;
    }
    setGenerating(false);
    if (outcome.kind === "ok") {
      if (chips.addGenerated(outcome.code)) {
        clearBarcodesFieldError();
      }
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
      onRateLimited(outcome.retryAfterSeconds);
      return;
    }
    setGenerateError(generateFailedMessage);
  }

  const disabled = generating || hasInternalBarcode(chips.barcodes);

  return { generating, generateError, disabled, reset, handleGenerate };
}

type NewProductModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (product: ProductSummary) => void;
  onSessionEnded: () => void;
  createProduct: typeof createProduct;
  generateInternalBarcode: typeof generateInternalBarcode;
  categories: CategorySummary[];
};

/** Creates a catalog product with its barcodes; no passkey step-up. */
function NewProductModal({
  isOpen,
  onClose,
  onCreated,
  onSessionEnded,
  createProduct,
  generateInternalBarcode,
  categories,
}: NewProductModalProps) {
  const modalMessages = productsMessages.newProductModal;
  // Neither starts pre-chosen: defaulting to the first category or a fixed unit would let someone
  // save a product in a category or unit nobody actually picked, which is exactly what the
  // "neither can be left out" rule guards against (a KG product silently saved as UNIT, or filed
  // under the wrong category, breaks pricing and category promotions).
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saleUnit, setSaleUnit] = useState<ProductSaleUnit | null>(null);
  const chips = useBarcodeChips([], modalMessages);
  const [errors, setErrors] = useState<ProductFieldErrors>({});
  const [notice, setNotice] = useState<
    | { kind: "attemptFailed" }
    | { kind: "rateLimited"; retryAfterSeconds: number; raisedByGenerate?: true }
    | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const generate = useGenerateInternalBarcode(
    chips,
    generateInternalBarcode,
    onSessionEnded,
    () => setErrors((current) => withFieldError(current, "barcodes", undefined)),
    (retryAfterSeconds) =>
      setNotice({ kind: "rateLimited", retryAfterSeconds, raisedByGenerate: true }),
    // Only the notice a generate attempt raised itself: one raised by saving or reloading still
    // holds, and a stale-version notice still drives the edit modal's reload action.
    () =>
      setNotice((current) =>
        current?.kind === "rateLimited" && current.raisedByGenerate ? null : current,
      ),
    modalMessages.generateFailed,
  );

  useEffect(() => {
    if (isOpen) {
      setName("");
      setCategoryId(null);
      setSaleUnit(null);
      chips.reset([]);
      setErrors({});
      setNotice(null);
      setSubmitting(false);
      generate.reset();
    }
  }, [isOpen, chips.reset, generate.reset]);

  const categoryOptions = categorySelectOptions(categories);

  async function handleSubmit() {
    const nameError = productNameError(name, modalMessages);
    const categoryError = categoryId ? undefined : modalMessages.categoryRequired;
    const unitError = saleUnit ? undefined : modalMessages.unitRequired;
    const pending = chips.commitPending();
    const barcodesError =
      pending.ok && pending.barcodes.length === 0 ? modalMessages.barcodeRequired : undefined;
    setErrors(productFieldErrors(nameError, categoryError, unitError, barcodesError));
    if (!pending.ok || !categoryId || !saleUnit || nameError || barcodesError) {
      return;
    }
    setNotice(null);
    setSubmitting(true);

    const input: CreateProductInput = {
      name: name.trim(),
      categoryId,
      saleUnit,
      barcodes: pending.barcodes,
    };
    const outcome = await createProduct(input);
    if (outcome.kind === "ok") {
      onCreated(outcome.value);
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
    if (outcome.kind === "validation_failed") {
      if (outcome.field === "name") {
        setErrors((current) => withFieldError(current, "name", modalMessages.nameRequired));
      } else if (outcome.field === "categoryId") {
        setErrors((current) => withFieldError(current, "category", modalMessages.categoryRequired));
      } else if (outcome.field === "saleUnit") {
        setErrors((current) => withFieldError(current, "unit", modalMessages.unitRequired));
      } else if (outcome.field === "barcodes") {
        setErrors((current) =>
          withFieldError(current, "barcodes", barcodesRejectedError(input.barcodes, modalMessages)),
        );
      } else {
        setNotice({ kind: "attemptFailed" });
      }
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "barcode_taken") {
      setErrors((current) => ({
        ...current,
        barcodes: barcodeTakenError(outcome.codes, modalMessages),
      }));
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

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
      icon={<PackagePlus />}
      context={modalMessages.eyebrow}
      title={modalMessages.heading}
      closable
      closeLabel={modalMessages.closeLabel}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            isDisabled={submitting}
            onPress={onClose}
          >
            {modalMessages.cancel}
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            isDisabled={submitting}
            onPress={() => void handleSubmit()}
          >
            {modalMessages.submit}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={modalMessages.attemptFailedTitle}
            detail={modalMessages.attemptFailedDetail}
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
        <TextField
          kind="plain-text"
          variant="backoffice"
          label={modalMessages.nameLabel}
          value={name}
          onChange={(value) => {
            setName(value);
            if (errors.name) {
              setErrors((current) =>
                withFieldError(current, "name", productNameError(value, modalMessages)),
              );
            }
          }}
          required
          {...(errors.name ? { invalid: true, errorMessage: errors.name } : {})}
        />
        {categoryOptions ? (
          <Select
            label={modalMessages.categoryLabel}
            placeholder={modalMessages.categoryPlaceholder}
            options={categoryOptions}
            value={categoryId}
            onChange={(value) => {
              setCategoryId(value);
              setErrors((current) => withFieldError(current, "category", undefined));
            }}
            required
            {...(errors.category ? { invalid: true, errorMessage: errors.category } : {})}
          />
        ) : (
          <div className="flex flex-col gap-1">
            <span className={requiredLabelClassName}>{modalMessages.categoryLabel}</span>
            {errors.category && (
              <span className="text-sm font-normal text-status-error-ui">{errors.category}</span>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <span className={requiredLabelClassName}>{modalMessages.unitLabel}</span>
          <OptionCardGroup
            label={modalMessages.unitLabel}
            options={[
              {
                value: "UNIT",
                icon: <Package />,
                title: modalMessages.unitOptionUnitTitle,
                helpText: modalMessages.unitOptionUnitHelp,
              },
              {
                value: "KG",
                icon: <Scale />,
                title: modalMessages.unitOptionWeightTitle,
                helpText: modalMessages.unitOptionWeightHelp,
              },
            ]}
            value={saleUnit}
            onChange={(value) => {
              setSaleUnit(value);
              setErrors((current) => withFieldError(current, "unit", undefined));
            }}
            required
            {...(errors.unit ? { invalid: true, errorMessage: errors.unit } : {})}
          />
        </div>
        <BarcodeChips
          barcodes={chips.barcodes}
          onRemove={chips.remove}
          scanInput={chips.scanInput}
          onScanInputChange={chips.changeScanInput}
          onScanKeyDown={(event) =>
            chips.handleScanKeyDown(event, () =>
              setErrors((current) => withFieldError(current, "barcodes", undefined)),
            )
          }
          onGenerate={() => void generate.handleGenerate()}
          generateDisabled={generate.disabled}
          labels={modalMessages}
          error={errors.barcodes}
          scanError={chips.scanError}
          generateError={generate.generateError}
        />
      </div>
    </Modal>
  );
}

type EditProductModalProps = {
  target: ProductSummary | null;
  onClose: () => void;
  onSaved: (product: ProductSummary) => void;
  onSessionEnded: () => void;
  fetchProducts: typeof fetchProducts;
  editProduct: typeof editProduct;
  generateInternalBarcode: typeof generateInternalBarcode;
  categories: CategorySummary[];
};

type EditNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number; raisedByGenerate?: true }
  | { kind: "staleVersion" }
  | { kind: "notFound" }
  | { kind: "reloadFailed" };

/** Edits a catalog product, rejecting a save over a newer version; no passkey step-up. */
function EditProductModal({
  target,
  onClose,
  onSaved,
  onSessionEnded,
  fetchProducts,
  editProduct,
  generateInternalBarcode,
  categories,
}: EditProductModalProps) {
  const modalMessages = productsMessages.editProductModal;
  const isOpen = target !== null;
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saleUnit, setSaleUnit] = useState<ProductSaleUnit>("UNIT");
  const [version, setVersion] = useState(1);
  // The dialog's own title: the product's name as it was when the dialog opened (see
  // CategoriesListScreen.tsx's own EditCategoryModal for the same non-nullable-title reasoning).
  const [title, setTitle] = useState("");
  const chips = useBarcodeChips([], modalMessages);
  const [errors, setErrors] = useState<ProductFieldErrors>({});
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const targetRef = useRef(target);
  targetRef.current = target;
  const generate = useGenerateInternalBarcode(
    chips,
    generateInternalBarcode,
    onSessionEnded,
    () => setErrors((current) => withFieldError(current, "barcodes", undefined)),
    (retryAfterSeconds) =>
      setNotice({ kind: "rateLimited", retryAfterSeconds, raisedByGenerate: true }),
    // Only the notice a generate attempt raised itself: one raised by saving or reloading still
    // holds, and a stale-version notice still drives the edit modal's reload action.
    () =>
      setNotice((current) =>
        current?.kind === "rateLimited" && current.raisedByGenerate ? null : current,
      ),
    modalMessages.generateFailed,
  );

  useEffect(() => {
    if (isOpen && target) {
      setName(target.name);
      setCategoryId(target.categoryId);
      setSaleUnit(target.saleUnit);
      setVersion(target.version);
      setTitle(target.name);
      chips.reset(target.barcodes);
      setErrors({});
      setNotice(null);
      setSubmitting(false);
      generate.reset();
    }
  }, [isOpen, target, chips.reset, generate.reset]);

  const categoryOptions = categorySelectOptions(categories);

  async function handleSubmit() {
    const current = targetRef.current;
    if (!current) {
      return;
    }
    const nameError = productNameError(name, modalMessages);
    const categoryError = categoryId ? undefined : modalMessages.categoryRequired;
    const pending = chips.commitPending();
    const barcodesError =
      pending.ok && pending.barcodes.length === 0 ? modalMessages.barcodeRequired : undefined;
    // Category and sale unit are already the product's own current values here (never chosen
    // through this modal for the first time), so unlike NewProductModal, `unit` is never invalid.
    setErrors(productFieldErrors(nameError, categoryError, undefined, barcodesError));
    if (!pending.ok || nameError || categoryError || barcodesError) {
      return;
    }
    setNotice(null);
    setSubmitting(true);

    const sentBarcodes = pending.barcodes;
    const outcome = await editProduct(current.id, {
      name: name.trim(),
      categoryId,
      saleUnit,
      barcodes: sentBarcodes,
      version,
    });
    if (outcome.kind === "ok") {
      onSaved(outcome.value);
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
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "stale_version") {
      setNotice({ kind: "staleVersion" });
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "validation_failed") {
      if (outcome.field === "name") {
        setErrors((current) => withFieldError(current, "name", modalMessages.nameRequired));
      } else if (outcome.field === "categoryId") {
        setErrors((current) => withFieldError(current, "category", modalMessages.categoryRequired));
      } else if (outcome.field === "barcodes") {
        setErrors((current) =>
          withFieldError(current, "barcodes", barcodesRejectedError(sentBarcodes, modalMessages)),
        );
      } else {
        setNotice({ kind: "attemptFailed" });
      }
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "barcode_taken") {
      setErrors((current) => ({
        ...current,
        barcodes: barcodeTakenError(outcome.codes, modalMessages),
      }));
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  async function handleReload() {
    const current = targetRef.current;
    if (!current) {
      return;
    }
    setSubmitting(true);
    const outcome = await fetchProducts("all");
    if (outcome.kind === "ok") {
      const fresh = outcome.value.find((product) => product.id === current.id);
      if (!fresh) {
        setNotice({ kind: "notFound" });
        setSubmitting(false);
        return;
      }
      setName(fresh.name);
      setTitle(fresh.name);
      setCategoryId(fresh.categoryId);
      setSaleUnit(fresh.saleUnit);
      setVersion(fresh.version);
      chips.reset(fresh.barcodes);
      setErrors({});
      setNotice(null);
      setSubmitting(false);
      generate.reset();
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

  const offersReload = notice?.kind === "staleVersion" || notice?.kind === "reloadFailed";

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
      context={modalMessages.eyebrow}
      title={title}
      closable
      closeLabel={modalMessages.closeLabel}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            isDisabled={submitting}
            onPress={onClose}
          >
            {modalMessages.cancel}
          </Button>
          {offersReload ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleReload()}
            >
              {modalMessages.reload}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleSubmit()}
            >
              {modalMessages.submit}
            </Button>
          )}
        </>
      }
    >
      {target && (
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={modalMessages.attemptFailedTitle}
              detail={modalMessages.attemptFailedDetail}
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
          {notice?.kind === "staleVersion" && (
            <InlineNotice
              tone="error"
              icon={<RotateCcw />}
              title={modalMessages.staleVersionTitle}
              detail={modalMessages.staleVersionDetail}
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
          <TextField
            kind="plain-text"
            variant="backoffice"
            label={modalMessages.nameLabel}
            value={name}
            onChange={(value) => {
              setName(value);
              if (errors.name) {
                setErrors((current) =>
                  withFieldError(current, "name", productNameError(value, modalMessages)),
                );
              }
            }}
            required
            {...(errors.name ? { invalid: true, errorMessage: errors.name } : {})}
          />
          {categoryOptions ? (
            <Select
              label={modalMessages.categoryLabel}
              options={categoryOptions}
              value={categoryId}
              onChange={(value) => {
                setCategoryId(value);
                setErrors((current) => withFieldError(current, "category", undefined));
              }}
              required
              {...(errors.category ? { invalid: true, errorMessage: errors.category } : {})}
            />
          ) : (
            <div className="flex flex-col gap-1">
              <span className={requiredLabelClassName}>{modalMessages.categoryLabel}</span>
              {errors.category && (
                <span className="text-sm font-normal text-status-error-ui">{errors.category}</span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className={requiredLabelClassName}>{modalMessages.unitLabel}</span>
            <OptionCardGroup
              label={modalMessages.unitLabel}
              options={[
                {
                  value: "UNIT",
                  icon: <Package />,
                  title: modalMessages.unitOptionUnitTitle,
                  helpText: modalMessages.unitOptionUnitHelp,
                },
                {
                  value: "KG",
                  icon: <Scale />,
                  title: modalMessages.unitOptionWeightTitle,
                  helpText: modalMessages.unitOptionWeightHelp,
                },
              ]}
              value={saleUnit}
              onChange={setSaleUnit}
              required
            />
          </div>
          <BarcodeChips
            barcodes={chips.barcodes}
            onRemove={chips.remove}
            scanInput={chips.scanInput}
            onScanInputChange={chips.changeScanInput}
            onScanKeyDown={(event) =>
              chips.handleScanKeyDown(event, () =>
                setErrors((current) => withFieldError(current, "barcodes", undefined)),
              )
            }
            onGenerate={() => void generate.handleGenerate()}
            generateDisabled={generate.disabled}
            labels={modalMessages}
            error={errors.barcodes}
            scanError={chips.scanError}
            generateError={generate.generateError}
          />
        </div>
      )}
    </Modal>
  );
}

type DeactivateProductModalProps = {
  target: ProductSummary | null;
  onClose: () => void;
  onDeactivated: () => void;
  onVanished: () => void;
  onSessionEnded: () => void;
  deactivateProduct: typeof deactivateProduct;
};

type DeactivateNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "alreadyInactive" };

/** Confirms deactivating a product; unlike deactivating a user, this needs no passkey step-up. */
function DeactivateProductModal({
  target,
  onClose,
  onDeactivated,
  onVanished,
  onSessionEnded,
  deactivateProduct,
}: DeactivateProductModalProps) {
  const modalMessages = productsMessages.deactivateModal;
  const isOpen = target !== null;
  // The dialog's own title, the same non-nullable-title reasoning EditProductModal's own title
  // state carries: kept across the closing animation instead of blanking once target is nulled.
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<DeactivateNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (isOpen && target) {
      setTitle(modalMessages.title({ name: target.name }));
      setNotice(null);
      setSubmitting(false);
    }
  }, [isOpen, target]);

  async function handleConfirm() {
    const current = targetRef.current;
    if (!current) {
      return;
    }
    setNotice(null);
    setSubmitting(true);

    const outcome = await deactivateProduct(current.id);
    if (outcome.kind === "ok") {
      onDeactivated();
      return;
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "alreadyInactive" });
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
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  const alreadyGone = notice?.kind === "alreadyInactive";

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="confirmation"
      tone="error"
      icon={<Ban />}
      title={title}
      closable
      closeLabel={modalMessages.closeLabel}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            isDisabled={submitting}
            onPress={onClose}
          >
            {modalMessages.cancel}
          </Button>
          {alreadyGone ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              isDisabled={submitting}
              onPress={onVanished}
            >
              {modalMessages.reload}
            </Button>
          ) : (
            <Button
              variant="primary"
              tone="destructive"
              size="large"
              icon={<Ban />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleConfirm()}
            >
              {modalMessages.confirm}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-base text-ink">{modalMessages.body}</p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={modalMessages.attemptFailedTitle}
            detail={modalMessages.attemptFailedDetail}
          />
        )}
        {notice?.kind === "alreadyInactive" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={modalMessages.alreadyInactiveTitle}
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
      </div>
    </Modal>
  );
}

type LabelableProduct = { product: ProductSummary; code: string };

// Only a product's first internal barcode counts (a product can carry more than one code once
// it has ever been re-generated), sorted the same way the table's own default sort reads.
function labelableProducts(products: ProductSummary[]): LabelableProduct[] {
  return products
    .flatMap((product) => {
      if (!product.active) {
        return [];
      }
      const code = product.barcodes.find(isInternalBarcode);
      return code ? [{ product, code }] : [];
    })
    .sort((a, b) => nameCollator(a.product, b.product));
}

// The standard EAN-13 human-readable layout: the first digit alone, then the left and right
// halves of six digits each.
function groupedEan13Digits(code: string): string {
  return `${code.slice(0, 1)} ${code.slice(1, 7)} ${code.slice(7, 13)}`;
}

// Merges adjacent "1" modules into a single wider bar (fewer elements than one <rect> per
// module), each keyed by its own start position, a real domain value rather than a raw loop
// index.
function barRuns(modules: string): { start: number; width: number }[] {
  const runs: { start: number; width: number }[] = [];
  let position = 0;
  while (position < modules.length) {
    if (modules[position] !== "1") {
      position += 1;
      continue;
    }
    const start = position;
    while (position < modules.length && modules[position] === "1") {
      position += 1;
    }
    runs.push({ start, width: position - start });
  }
  return runs;
}

// A decorative preview of the printed label's bars: the digits beside it are the code's own
// accessible text, so the bars carry aria-hidden instead of repeating it.
function LabelPreviewBars({ code }: { code: string }) {
  const modules = ean13Modules(code);
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${modules.length} 40`}
      preserveAspectRatio="none"
      className="h-10 w-full text-ink"
    >
      {barRuns(modules).map((run) => (
        <rect
          key={run.start}
          x={run.start}
          y={0}
          width={run.width}
          height={40}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

// Long enough for any browser to finish handing the blob to its download before it's released.
const DOWNLOAD_URL_LIFETIME_MS = 60_000;

type PrintNotice =
  | { kind: "attemptFailed" }
  | { kind: "productsChanged" }
  | { kind: "reloadFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

type PrintLabelsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSessionEnded: () => void;
  products: ProductSummary[];
  onProductsReloaded: (products: ProductSummary[]) => void;
  status: ProductStatusFilter;
  fetchProducts: typeof fetchProducts;
  printLabels: typeof printLabels;
};

/**
 * Downloads a printable A4 sheet of internal-barcode labels for the chosen products and counts;
 * no passkey step-up. The product list comes from the screen's own already-loaded products (no
 * separate fetch), so a product added, renamed or removed elsewhere is only reflected on reload.
 */
function PrintLabelsModal({
  isOpen,
  onClose,
  onSessionEnded,
  products,
  onProductsReloaded,
  status,
  fetchProducts,
  printLabels,
}: PrintLabelsModalProps) {
  const modalMessages = productsMessages.printLabelsModal;
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<PrintNotice | null>(null);
  const [printing, setPrinting] = useState(false);
  const [reloading, setReloading] = useState(false);
  // Bumped whenever the modal opens or closes, so a print or reload response still in flight from before
  // can tell it no longer belongs to the modal on screen.
  const printRequestIdRef = useRef(0);

  useEffect(() => {
    printRequestIdRef.current += 1;
    if (isOpen) {
      setCounts({});
      setNotice(null);
      setPrinting(false);
      setReloading(false);
    }
  }, [isOpen]);

  const rows = useMemo(() => labelableProducts(products), [products]);
  const total = rows.reduce((sum, row) => sum + (counts[row.product.id] ?? 0), 0);
  const previewRow = rows.find((row) => (counts[row.product.id] ?? 0) > 0) ?? rows[0];
  const busy = printing || reloading;

  function changeCount(productId: string, delta: 1 | -1) {
    setCounts((current) => {
      const count = current[productId] ?? 0;
      const currentTotal = Object.values(current).reduce((sum, value) => sum + value, 0);
      const ceiling = Math.min(
        LABELS_MAX_COUNT_PER_PRODUCT,
        count + Math.max(0, LABELS_MAX_TOTAL_COUNT - currentTotal),
      );
      return { ...current, [productId]: Math.max(0, Math.min(ceiling, count + delta)) };
    });
  }

  async function handleDownload() {
    const entries = rows
      .map((row) => ({ productId: row.product.id, count: counts[row.product.id] ?? 0 }))
      .filter((entry) => entry.count > 0);
    if (entries.length === 0) {
      return;
    }
    setNotice(null);
    setPrinting(true);
    const requestId = printRequestIdRef.current;
    const outcome = await printLabels(entries);
    if (requestId !== printRequestIdRef.current) {
      return;
    }
    if (outcome.kind === "ok") {
      const url = URL.createObjectURL(outcome.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = modalMessages.downloadFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking right after click() can cancel the download in Firefox and Safari, which read
      // the blob asynchronously.
      setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
      // Closes instead of staying open: the products just printed came from a snapshot that can
      // now be stale (someone edited a product meanwhile), and reopening re-syncs with the
      // screen's current list instead of carrying that snapshot (and the chosen counts) forward.
      setPrinting(false);
      onClose();
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
      setPrinting(false);
      return;
    }
    if (
      outcome.kind === "product_not_found" ||
      outcome.kind === "product_without_internal_barcode"
    ) {
      setNotice({ kind: "productsChanged" });
      setPrinting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setPrinting(false);
  }

  async function handleReload() {
    setReloading(true);
    const requestId = printRequestIdRef.current;
    const outcome = await fetchProducts(status);
    if (requestId !== printRequestIdRef.current) {
      return;
    }
    if (outcome.kind === "ok") {
      onProductsReloaded(outcome.value);
      setCounts({});
      setNotice(null);
      setReloading(false);
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
      setReloading(false);
      return;
    }
    setNotice({ kind: "reloadFailed" });
    setReloading(false);
  }

  const offersReload = notice?.kind === "productsChanged" || notice?.kind === "reloadFailed";

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
      icon={<Printer />}
      context={modalMessages.eyebrow}
      title={modalMessages.heading}
      closable
      closeLabel={modalMessages.closeLabel}
      footer={
        <>
          <Button variant="secondary" size="large" icon={<X />} isDisabled={busy} onPress={onClose}>
            {modalMessages.cancel}
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Download />}
            fullWidth
            isDisabled={busy || total === 0}
            onPress={() => void handleDownload()}
          >
            {modalMessages.download}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={modalMessages.attemptFailedTitle}
            detail={modalMessages.attemptFailedDetail}
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
        {notice?.kind === "productsChanged" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={modalMessages.productsChangedTitle}
            detail={modalMessages.productsChangedDetail}
          />
        )}
        {notice?.kind === "reloadFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={modalMessages.reloadFailedTitle}
            detail={modalMessages.reloadFailedDetail}
          />
        )}
        {offersReload && (
          <Button variant="secondary" isDisabled={reloading} onPress={() => void handleReload()}>
            {modalMessages.reload}
          </Button>
        )}
        <p className="text-base text-ink">{modalMessages.intro}</p>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-bone px-4 py-8 text-center">
            <Package aria-hidden="true" className="size-6 text-ink-secondary" />
            <p className="text-base font-bold text-ink">{modalMessages.emptyTitle}</p>
            <p className="text-sm text-ink-secondary">{modalMessages.emptyDetail}</p>
          </div>
        ) : (
          <>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {rows.map(({ product, code }) => {
                const count = counts[product.id] ?? 0;
                return (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-surface-bone px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-base font-bold text-ink">{product.name}</span>
                      <span className="truncate font-mono text-sm text-ink-secondary">{code}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <IconButton
                        icon={<Minus />}
                        aria-label={modalMessages.decreaseAria({ name: product.name })}
                        isDisabled={count === 0}
                        onPress={() => changeCount(product.id, -1)}
                      />
                      <span className="w-8 text-center font-mono text-base text-ink">{count}</span>
                      <IconButton
                        icon={<Plus />}
                        aria-label={modalMessages.increaseAria({ name: product.name })}
                        isDisabled={
                          count === LABELS_MAX_COUNT_PER_PRODUCT || total >= LABELS_MAX_TOTAL_COUNT
                        }
                        onPress={() => changeCount(product.id, 1)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {previewRow && (
              // A <fieldset> carries the implicit "group" role a plain div would need role="group"
              // for; Tailwind's preflight strips its native border/padding/margin, so the
              // component's own classes are all that paint it.
              <fieldset
                aria-label={modalMessages.previewAria}
                className="flex items-center gap-4 rounded-lg border border-line p-3"
              >
                <div className="flex w-36 shrink-0 flex-col items-center gap-2 rounded border border-line p-3">
                  <span className="line-clamp-2 text-center text-xs font-bold text-ink">
                    {previewRow.product.name}
                  </span>
                  <LabelPreviewBars code={previewRow.code} />
                  <span className="font-mono text-xs text-ink">
                    {groupedEan13Digits(previewRow.code)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xl font-bold text-brand-blue-strong">
                    {modalMessages.summary({ count: total })}
                  </p>
                  <p className="text-sm text-ink-secondary">{modalMessages.summaryDetail}</p>
                </div>
              </fieldset>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * "Productos": the catalog's products, listed with their category and sale unit, searchable by
 * name or barcode, filterable and editable in place. Gated by `manage_products_and_categories`:
 * App.tsx only ever routes here for someone who holds it, and a `forbidden` read (a role change
 * mid-session) sends the browser to Mi cuenta instead of showing a notice.
 */
export function ProductsListScreen({ onSessionEnded, services }: ProductsListScreenProps) {
  const {
    fetchProducts: fetchProductsService,
    createProduct: createProductService,
    editProduct: editProductService,
    deactivateProduct: deactivateProductService,
    fetchCategories: fetchCategoriesService,
    generateInternalBarcode: generateInternalBarcodeService,
    printLabels: printLabelsService,
  } = services ?? defaultProductsListScreenServices;
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const listRef = useRef(list);
  listRef.current = list;
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [unitFilter, setUnitFilter] = useState<UnitFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>("active");
  const [sort, setSort] = useState<TableSort<"product">>({
    column: "product",
    direction: "ascending",
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductSummary | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ProductSummary | null>(null);
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  // Only the latest load may settle the list: an earlier one still in flight would otherwise
  // overwrite it with a stale result.
  const latestLoad = useRef(0);

  // Every category is offered here, not just the ones some existing product already holds, so a
  // category that was just created with nobody in it yet can still be picked right away. Products
  // and categories load (and retry) together: the create action needs both. The status filter is
  // sent to the server instead of applied client-side, the same split search/category/unit keep
  // (those narrow an already-loaded page; status narrows what gets fetched in the first place).
  const load = useCallback(async () => {
    latestLoad.current += 1;
    const thisLoad = latestLoad.current;
    setList({ kind: "loading" });
    const [productsOutcome, categoriesOutcome] = await Promise.all([
      fetchProductsService(statusFilter),
      fetchCategoriesService(),
    ]);
    if (thisLoad !== latestLoad.current) {
      return;
    }
    const outcomes = [productsOutcome, categoriesOutcome];
    if (outcomes.some((outcome) => outcome.kind === "unauthenticated")) {
      onSessionEndedRef.current();
      return;
    }
    const rateLimited = outcomes.flatMap((outcome) =>
      outcome.kind === "rate_limited" ? [outcome.retryAfterSeconds] : [],
    );
    if (rateLimited.length > 0) {
      setList({ kind: "rate_limited", retryAfterSeconds: Math.max(...rateLimited) });
    } else if (outcomes.some((outcome) => outcome.kind === "forbidden")) {
      sendToMyAccount();
    } else if (productsOutcome.kind === "ok" && categoriesOutcome.kind === "ok") {
      setCategories(categoriesOutcome.value);
      setList({ kind: "loaded", products: productsOutcome.value });
    } else {
      setList({ kind: "loadError" });
    }
  }, [fetchProductsService, fetchCategoriesService, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const products = list.kind === "loaded" ? list.products : [];

  const categoryFilterOptions = useMemo(() => {
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, "es"));
    return [
      { value: "ALL" as const, label: productsMessages.categoryFilterAllOption },
      ...sorted.map((category) => ({ value: category.id, label: category.name })),
    ] as [{ value: CategoryFilter; label: string }, ...{ value: CategoryFilter; label: string }[]];
  }, [categories]);

  const unitFilterOptions = [
    { value: "ALL" as const, label: productsMessages.unitFilterAllOption },
    { value: "UNIT" as const, label: productsMessages.unitOptionLabels.UNIT },
    { value: "KG" as const, label: productsMessages.unitOptionLabels.KG },
  ] as const;

  const statusFilterOptions = [
    { value: "active" as const, label: productsMessages.statusFilterActiveOption },
    { value: "inactive" as const, label: productsMessages.statusFilterInactiveOption },
    { value: "all" as const, label: productsMessages.statusFilterAllOption },
  ] as const;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let matching = products;
    if (query) {
      matching = matching.filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          product.barcodes.some((code) => code.toLowerCase().includes(query)),
      );
    }
    if (categoryFilter !== "ALL") {
      matching = matching.filter((product) => product.categoryId === categoryFilter);
    }
    if (unitFilter !== "ALL") {
      matching = matching.filter((product) => product.saleUnit === unitFilter);
    }
    return sortedByName(matching, sort.direction);
  }, [products, search, categoryFilter, unitFilter, sort.direction]);

  const columns = [
    {
      key: "product",
      title: productsMessages.columns.product,
      sortable: true,
      defaultDirection: "ascending",
      render: (item: ProductSummary) => item.name,
    },
    {
      key: "category",
      title: productsMessages.columns.category,
      render: (item: ProductSummary) => item.categoryName,
    },
    {
      key: "unit",
      title: productsMessages.columns.unit,
      render: (item: ProductSummary) => unitLabel(item.saleUnit),
    },
    {
      key: "status",
      title: productsMessages.columns.status,
      render: (item: ProductSummary) =>
        item.active ? (
          <StatusIndicator tone="success">{productsMessages.statusActive}</StatusIndicator>
        ) : (
          <StatusIndicator tone="neutral">{productsMessages.statusInactive}</StatusIndicator>
        ),
    },
    {
      key: "actions",
      kind: "actions",
      srLabel: productsMessages.rowActionsLabel,
      actions: [
        (item: ProductSummary) => ({
          icon: <Pencil />,
          "aria-label": productsMessages.editAria({ name: item.name }),
          onPress: () => setEditTarget(item),
        }),
        (item: ProductSummary) =>
          item.active
            ? {
                icon: <Ban />,
                "aria-label": productsMessages.deactivateAria({ name: item.name }),
                onPress: () => setDeactivateTarget(item),
              }
            : undefined,
      ],
    },
  ] as const;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
            <div className="flex flex-col justify-center">
              <p className="text-ink-secondary text-sm">{productsMessages.breadcrumb}</p>
              <h1 className="font-bold text-2xl text-brand-blue-strong">
                {productsMessages.heading}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                icon={<Printer />}
                isDisabled={list.kind !== "loaded"}
                onPress={() => setPrintModalOpen(true)}
              >
                {productsMessages.printLabelsButton}
              </Button>
              <Button variant="primary" icon={<Plus />} onPress={() => setNewModalOpen(true)}>
                {productsMessages.newProductButton}
              </Button>
            </div>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        {list.kind === "loadError" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={productsMessages.loadErrorTitle}
              detail={productsMessages.loadErrorDetail}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {productsMessages.retry}
            </Button>
          </>
        )}
        {list.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={productsMessages.rateLimitedTitle}
              detail={productsMessages.rateLimitedDetail({
                minutes: Math.ceil(list.retryAfterSeconds / 60),
              })}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {productsMessages.retry}
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
                  placeholder={productsMessages.searchPlaceholder}
                  icon={<Search />}
                />
              </div>
              <ListFilter
                label={productsMessages.categoryFilterLabel}
                options={categoryFilterOptions}
                value={categoryFilter}
                onChange={setCategoryFilter}
              />
              <ListFilter
                label={productsMessages.unitFilterLabel}
                options={unitFilterOptions}
                value={unitFilter}
                onChange={setUnitFilter}
              />
              <ListFilter
                label={productsMessages.statusFilterLabel}
                options={statusFilterOptions}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
            <Table
              aria-label={productsMessages.heading}
              columns={columns}
              sort={sort}
              onSortChange={setSort}
              loading={list.kind === "loading" ? "initial" : false}
              rows={filtered.map((product) => ({ id: product.id, item: product }))}
              empty={
                products.length === 0
                  ? {
                      icon: <Package />,
                      ...productsMessages.empty[statusFilter],
                      tone: "blank",
                    }
                  : {
                      icon: <SearchX />,
                      title: productsMessages.noResultsTitle,
                      detail: productsMessages.noResultsDetail,
                      tone: "filtered",
                    }
              }
              footer={
                <p className="text-ink-secondary text-sm">
                  {productsMessages.count({ count: filtered.length, status: statusFilter })}
                </p>
              }
            />
          </>
        )}
      </ScreenLayout>
      <NewProductModal
        isOpen={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={(product) => {
          setNewModalOpen(false);
          const current = listRef.current;
          if (current.kind === "loaded") {
            if (statusFilter !== "inactive") {
              setList({ kind: "loaded", products: [...current.products, product] });
            }
          } else {
            void load();
          }
        }}
        onSessionEnded={onSessionEnded}
        createProduct={createProductService}
        generateInternalBarcode={generateInternalBarcodeService}
        categories={categories}
      />
      <EditProductModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(product) => {
          setEditTarget(null);
          setList((current) =>
            current.kind === "loaded"
              ? {
                  kind: "loaded",
                  products: current.products.map((existing) =>
                    existing.id === product.id ? product : existing,
                  ),
                }
              : current,
          );
        }}
        onSessionEnded={onSessionEnded}
        fetchProducts={fetchProductsService}
        editProduct={editProductService}
        generateInternalBarcode={generateInternalBarcodeService}
        categories={categories}
      />
      <DeactivateProductModal
        target={deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onDeactivated={() => {
          setDeactivateTarget(null);
          void load();
        }}
        onVanished={() => {
          setDeactivateTarget(null);
          void load();
        }}
        onSessionEnded={onSessionEnded}
        deactivateProduct={deactivateProductService}
      />
      <PrintLabelsModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        onSessionEnded={onSessionEnded}
        products={products}
        onProductsReloaded={(reloaded) => setList({ kind: "loaded", products: reloaded })}
        status={statusFilter}
        fetchProducts={fetchProductsService}
        printLabels={printLabelsService}
      />
    </>
  );
}
