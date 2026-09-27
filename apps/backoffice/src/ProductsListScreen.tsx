import {
  BARCODE_MAX_LENGTH,
  ean13Modules,
  isBarcodeTooLong,
  isInternalBarcode,
  isProductNameTooLong,
  isValidNetContentQuantity,
  LABELS_MAX_COUNT_PER_PRODUCT,
  LABELS_MAX_TOTAL_COUNT,
  type NetContentUnit,
  PRODUCT_BARCODES_MAX_COUNT,
  PRODUCT_NAME_MAX_LENGTH,
} from "@purosur/contracts";
import {
  Button,
  FieldGroup,
  IconButton,
  InlineNotice,
  ListFilter,
  Modal,
  OptionCardGroup,
  plural,
  QuantityUnitField,
  type QuantityUnitFieldOption,
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
import { categoriesInTreeOrder, categoryPathLabels, leafCategories } from "./categoryPath";
import {
  formatNetContentQuantity,
  NET_CONTENT_QUANTITY_INVALID,
  netContentQuantityError,
  parseNetContentQuantity,
} from "./netContentQuantity";
import {
  type CreateProductInput,
  createProduct,
  deactivateProduct,
  editProduct,
  fetchProducts,
  generateInternalBarcode,
  type NetContent,
  type ProductSaleUnit,
  type ProductStatusFilter,
  type ProductSummary,
  printLabels,
} from "./productsApi";
import { retryAfterDetail } from "./retryAfterDetail";
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
  services?: ProductsListScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; products: ProductSummary[] };

type CategoryFilter = "ALL" | string;
type UnitFilter = "ALL" | ProductSaleUnit;

const HEADING = "Productos";
const RETRY_LABEL = "Reintentar";
const RATE_LIMITED_TITLE = "Demasiadas solicitudes";
const TRY_AGAIN_DETAIL = "Probá de nuevo.";
const CANCEL_LABEL = "Cancelar";
const PRODUCT_MODAL_EYEBROW = "Catálogo · Productos";
const PRODUCT_NAME_TOO_LONG = `El nombre puede tener hasta ${PRODUCT_NAME_MAX_LENGTH} caracteres.`;
const PRODUCT_CATEGORY_LABEL = "Categoría";
const PRODUCT_CATEGORY_REQUIRED = "Elegí una categoría.";
// Only reachable by a race: the category gains a subcategory of its own between loading this
// form and submitting it.
const PRODUCT_CATEGORY_NOT_LEAF_ERROR = (params: { category: string }) =>
  `"${params.category}" tiene subcategorías. Elegí una de ellas.`;
const PRODUCT_NAME_REQUIRED = "Ingresá el nombre del producto.";
const PRODUCT_UNIT_LABEL = "Unidad de venta";
// The two sale-unit option cards, identical in the new and the edit product modal.
const SALE_UNIT_OPTION_CONTENT = {
  UNIT: { title: "Por unidad", helpText: "Se vende de a uno" },
  KG: { title: "Por peso", helpText: "Se pesa en la balanza" },
} satisfies Record<ProductSaleUnit, { title: string; helpText: string }>;
const PRODUCT_SCAN_INPUT_LABEL = "Escanear otro código";
const PRODUCT_BARCODE_REQUIRED = "Escaneá al menos un código de barras.";
const PRODUCT_BARCODE_ALREADY_LISTED = "Ese código ya está en la lista.";
const PRODUCT_BARCODE_HAS_SPACES = "El código de barras no puede tener espacios.";
const PRODUCT_BARCODE_TOO_LONG = `El código de barras puede tener hasta ${BARCODE_MAX_LENGTH} caracteres.`;
const PRODUCT_BARCODE_LIMIT_REACHED = `El producto puede tener hasta ${PRODUCT_BARCODES_MAX_COUNT} códigos de barras.`;
const PRODUCT_BARCODE_INVALID = "Alguno de los códigos de barras no es válido.";
const PRODUCT_BARCODE_TAKEN_UNNAMED = "Alguno de los códigos ya es de otro producto.";
const PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED =
  "No se pudo generar el código interno. Probá de nuevo.";
const PRODUCT_NET_CONTENT_LABEL = "Contenido neto";
const PRODUCT_NET_CONTENT_UNIT_LABEL = "Unidad";
const PRODUCT_NET_CONTENT_INVALID = "Revisá el contenido neto.";

function barcodeTakenText(params: { codes: string[] }): string {
  const list = params.codes.join(", ");
  return plural(params.codes.length, {
    one: `El código ${list} ya es de otro producto.`,
    other: `Los códigos ${list} ya son de otro producto.`,
  });
}

const UNIT_OPTION_LABELS = {
  UNIT: "Por unidad",
  KG: "Por peso",
} satisfies Record<ProductSaleUnit, string>;

const NET_CONTENT_UNIT_OPTION_LABELS = {
  G: "g",
  KG: "kg",
  ML: "ml",
  L: "l",
  UNIT: "u",
} satisfies Record<NetContentUnit, string>;

const PRODUCTS_EMPTY_STATE = {
  active: { title: "No hay productos activos", detail: "Creá uno para verlo en la lista." },
  inactive: { title: "No hay productos inactivos" },
  all: {
    title: "Todavía no hay productos",
    detail: "Creá el primero para verlo en la lista.",
  },
} satisfies Record<ProductStatusFilter, { title: string; detail?: string }>;

function productsCountText(params: { count: number; status: ProductStatusFilter }): string {
  if (params.status === "active") {
    return plural(params.count, {
      one: "1 producto activo",
      other: `${params.count} productos activos`,
    });
  }
  if (params.status === "inactive") {
    return plural(params.count, {
      one: "1 producto inactivo",
      other: `${params.count} productos inactivos`,
    });
  }
  return plural(params.count, { one: "1 producto", other: `${params.count} productos` });
}

function unitLabel(saleUnit: ProductSaleUnit): string {
  return UNIT_OPTION_LABELS[saleUnit];
}

const NET_CONTENT_UNIT_OPTIONS: [
  QuantityUnitFieldOption<NetContentUnit>,
  ...QuantityUnitFieldOption<NetContentUnit>[],
] = [
  { id: "G", label: NET_CONTENT_UNIT_OPTION_LABELS.G },
  { id: "KG", label: NET_CONTENT_UNIT_OPTION_LABELS.KG },
  { id: "ML", label: NET_CONTENT_UNIT_OPTION_LABELS.ML },
  { id: "L", label: NET_CONTENT_UNIT_OPTION_LABELS.L },
  { id: "UNIT", label: NET_CONTENT_UNIT_OPTION_LABELS.UNIT },
];

const NET_CONTENT_DEFAULT_UNIT: NetContentUnit = "G";

function netContentToSend(quantity: string, unit: NetContentUnit): NetContent | null {
  const parsed = parseNetContentQuantity(quantity);
  return parsed !== undefined && isValidNetContentQuantity(parsed)
    ? { quantity: parsed, unit }
    : null;
}

function netContentQuantityText(netContent: NetContent | null): string {
  return netContent ? formatNetContentQuantity(netContent.quantity) : "";
}

function netContentUnitOf(netContent: NetContent | null): NetContentUnit {
  return netContent ? netContent.unit : NET_CONTENT_DEFAULT_UNIT;
}

function nameCollator(a: ProductSummary, b: ProductSummary): number {
  return a.name.localeCompare(b.name, "es");
}

function sortedByName(products: ProductSummary[], direction: "ascending" | "descending") {
  const sorted = [...products].sort(nameCollator);
  return direction === "ascending" ? sorted : sorted.reverse();
}

// Full paths disambiguate leaves that share a name under different parents.
function categorySelectOptions(
  categories: CategorySummary[],
): [SelectOption<string>, ...SelectOption<string>[]] | undefined {
  const leafIds = new Set(leafCategories(categories).map((category) => category.id));
  if (leafIds.size === 0) {
    return undefined;
  }
  const labels = categoryPathLabels(categories);
  const leaves = categoriesInTreeOrder(categories, "ascending").filter((category) =>
    leafIds.has(category.id),
  );
  const [first, ...rest] = leaves.map((category) => ({
    value: category.id,
    label: labels.get(category.id) ?? category.name,
  }));
  if (!first) {
    throw new Error("no category to offer: leaves.length > 0 was already checked");
  }
  return [first, ...rest];
}

function productNameError(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return PRODUCT_NAME_REQUIRED;
  }
  if (isProductNameTooLong(trimmed)) {
    return PRODUCT_NAME_TOO_LONG;
  }
  return undefined;
}

const barcodeActionClassName =
  "flex h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-base font-bold " +
  "text-brand-blue-strong shadow-[inset_0_0_0_2px_var(--color-brand-blue-ui)] " +
  "outline-none transition-[background-color]";

// `outline-none` also clears the outline style, so `outline-solid` is needed to show it again.
const scanControlClassName =
  `${barcodeActionClassName} relative min-w-0 cursor-text hover:bg-surface-bone ` +
  "focus-within:outline-[3px] focus-within:outline-solid focus-within:outline-offset-3 " +
  "focus-within:outline-brand-blue-strong";

// `enabled:` keeps the hover fill off a disabled button.
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
    <FieldGroup label="Códigos de barras" required>
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
                aria-label={`Quitar el código ${code}`}
                onPress={() => onRemove(code)}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <label className={scanControlClassName}>
          {!scanInput && !scanFocused && (
            <span
              aria-hidden="true"
              className="pointer-events-none flex min-w-0 items-center justify-center gap-2"
            >
              <ScanBarcode className="size-[1.125rem] shrink-0" />
              <span className="truncate">{PRODUCT_SCAN_INPUT_LABEL}</span>
            </span>
          )}
          <input
            className="absolute inset-0 size-full rounded-lg bg-transparent px-3 text-center outline-none"
            value={scanInput}
            onChange={(event) => onScanInputChange(event.target.value)}
            onKeyDown={onScanKeyDown}
            onFocus={() => setScanFocused(true)}
            onBlur={() => setScanFocused(false)}
            aria-label={PRODUCT_SCAN_INPUT_LABEL}
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
          <span className="truncate">Generar código interno</span>
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
    </FieldGroup>
  );
}

type ProductFieldErrors = {
  name?: string;
  category?: string;
  unit?: string;
  barcodes?: string;
  netContent?: string;
};
type ProductFieldErrorKey = keyof ProductFieldErrors;

// Deletes the key instead of setting `undefined`: `exactOptionalPropertyTypes` treats an
// explicit `undefined` as different from an absent key.
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
  netContent: string | undefined,
): ProductFieldErrors {
  let next: ProductFieldErrors = {};
  next = withFieldError(next, "name", name);
  next = withFieldError(next, "category", category);
  next = withFieldError(next, "unit", unit);
  next = withFieldError(next, "barcodes", barcodes);
  next = withFieldError(next, "netContent", netContent);
  return next;
}

type PendingCodeResult = { ok: true; barcodes: string[]; added: boolean } | { ok: false };

function scanErrorFor(code: string, listed: string[]): string | undefined {
  if (/\s/.test(code)) {
    return PRODUCT_BARCODE_HAS_SPACES;
  }
  if (isBarcodeTooLong(code)) {
    return PRODUCT_BARCODE_TOO_LONG;
  }
  if (listed.includes(code)) {
    return PRODUCT_BARCODE_ALREADY_LISTED;
  }
  if (listed.length >= PRODUCT_BARCODES_MAX_COUNT) {
    return PRODUCT_BARCODE_LIMIT_REACHED;
  }
  return undefined;
}

function barcodesRejectedError(sent: string[]): string {
  return sent.length > 0 ? PRODUCT_BARCODE_INVALID : PRODUCT_BARCODE_REQUIRED;
}

function barcodeTakenError(codes: string[]): string {
  return codes.length > 0 ? barcodeTakenText({ codes }) : PRODUCT_BARCODE_TAKEN_UNNAMED;
}

function hasInternalBarcode(barcodes: string[]): boolean {
  return barcodes.some(isInternalBarcode);
}

function useBarcodeChips(initial: string[]) {
  const [barcodes, setBarcodes] = useState<string[]>(initial);
  const barcodesRef = useRef(barcodes);
  barcodesRef.current = barcodes;
  const [scanInput, setScanInput] = useState("");
  const [scanError, setScanError] = useState<string | undefined>(undefined);

  const reset = useCallback((next: string[]) => {
    setBarcodes(next);
    setScanInput("");
    setScanError(undefined);
  }, []);

  function changeScanInput(value: string) {
    setScanInput(value);
    setScanError(undefined);
  }

  function remove(code: string) {
    const next = barcodes.filter((existing) => existing !== code);
    setBarcodes(next);
    setScanError((current) =>
      current === undefined ? undefined : scanErrorFor(scanInput.trim(), next),
    );
  }

  function commitPending(): PendingCodeResult {
    const trimmed = scanInput.trim();
    if (!trimmed) {
      return { ok: true, barcodes, added: false };
    }
    const error = scanErrorFor(trimmed, barcodes);
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

  // Checked before allocating a code from the cloud, so a full list never wastes one.
  function refuseWhenFull(): boolean {
    if (barcodes.length < PRODUCT_BARCODES_MAX_COUNT) {
      return false;
    }
    setScanError(PRODUCT_BARCODE_LIMIT_REACHED);
    return true;
  }

  // The cloud already allocated and confirmed this code unique, so unlike a scanned one it
  // skips the spaces/length checks.
  function addGenerated(code: string): boolean {
    if (barcodesRef.current.length >= PRODUCT_BARCODES_MAX_COUNT) {
      setScanError(PRODUCT_BARCODE_LIMIT_REACHED);
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
  const requestIdRef = useRef(0);

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

function NewProductModal({
  isOpen,
  onClose,
  onCreated,
  onSessionEnded,
  createProduct,
  generateInternalBarcode,
  categories,
}: NewProductModalProps) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saleUnit, setSaleUnit] = useState<ProductSaleUnit | null>(null);
  const [netContentQuantity, setNetContentQuantity] = useState("");
  const [netContentUnit, setNetContentUnit] = useState<NetContentUnit>(NET_CONTENT_DEFAULT_UNIT);
  const chips = useBarcodeChips([]);
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
    () =>
      setNotice((current) =>
        current?.kind === "rateLimited" && current.raisedByGenerate ? null : current,
      ),
    PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  );

  useEffect(() => {
    if (isOpen) {
      setName("");
      setCategoryId(null);
      setSaleUnit(null);
      setNetContentQuantity("");
      setNetContentUnit(NET_CONTENT_DEFAULT_UNIT);
      chips.reset([]);
      setErrors({});
      setNotice(null);
      setSubmitting(false);
      generate.reset();
    }
  }, [isOpen, chips.reset, generate.reset]);

  const categoryOptions = categorySelectOptions(categories);

  async function handleSubmit() {
    const nameError = productNameError(name);
    const categoryError = categoryId ? undefined : PRODUCT_CATEGORY_REQUIRED;
    const unitError = saleUnit ? undefined : "Elegí la unidad de venta.";
    const pending = chips.commitPending();
    const barcodesError =
      pending.ok && pending.barcodes.length === 0 ? PRODUCT_BARCODE_REQUIRED : undefined;
    const netContentError = netContentQuantityError(netContentQuantity);
    setErrors(
      productFieldErrors(nameError, categoryError, unitError, barcodesError, netContentError),
    );
    if (!pending.ok || !categoryId || !saleUnit || nameError || barcodesError || netContentError) {
      return;
    }
    setNotice(null);
    setSubmitting(true);

    const input: CreateProductInput = {
      name: name.trim(),
      categoryId,
      saleUnit,
      barcodes: pending.barcodes,
      netContent: netContentToSend(netContentQuantity, netContentUnit),
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
        setErrors((current) => withFieldError(current, "name", PRODUCT_NAME_REQUIRED));
      } else if (outcome.field === "categoryId") {
        setErrors((current) => withFieldError(current, "category", PRODUCT_CATEGORY_REQUIRED));
      } else if (outcome.field === "saleUnit") {
        setErrors((current) => withFieldError(current, "unit", "Elegí la unidad de venta."));
      } else if (outcome.field === "barcodes") {
        setErrors((current) =>
          withFieldError(current, "barcodes", barcodesRejectedError(input.barcodes)),
        );
      } else if (outcome.field === "netContentQuantity") {
        setErrors((current) => withFieldError(current, "netContent", NET_CONTENT_QUANTITY_INVALID));
      } else if (outcome.field === "netContent") {
        setErrors((current) => withFieldError(current, "netContent", PRODUCT_NET_CONTENT_INVALID));
      } else {
        setNotice({ kind: "attemptFailed" });
      }
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "barcode_taken") {
      setErrors((current) => ({
        ...current,
        barcodes: barcodeTakenError(outcome.codes),
      }));
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "category_not_leaf") {
      const chosenCategoryName =
        categories.find((category) => category.id === input.categoryId)?.name ?? "";
      setErrors((current) =>
        withFieldError(
          current,
          "category",
          PRODUCT_CATEGORY_NOT_LEAF_ERROR({ category: chosenCategoryName }),
        ),
      );
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
      context={PRODUCT_MODAL_EYEBROW}
      title="Nuevo producto"
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            isDisabled={submitting}
            onPress={onClose}
          >
            {CANCEL_LABEL}
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            isDisabled={submitting}
            onPress={() => void handleSubmit()}
          >
            Crear el producto
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo crear el producto"
            detail={TRY_AGAIN_DETAIL}
          />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={RATE_LIMITED_TITLE}
            detail={retryAfterDetail(notice.retryAfterSeconds)}
          />
        )}
        <TextField
          kind="plain-text"
          label="Nombre"
          value={name}
          onChange={(value) => {
            setName(value);
            if (errors.name) {
              setErrors((current) => withFieldError(current, "name", productNameError(value)));
            }
          }}
          required
          {...(errors.name ? { invalid: true, errorMessage: errors.name } : {})}
        />
        {categoryOptions ? (
          <Select
            label={PRODUCT_CATEGORY_LABEL}
            placeholder="Elegí una categoría"
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
          <FieldGroup label={PRODUCT_CATEGORY_LABEL} required>
            {errors.category && (
              <span className="text-sm font-normal text-status-error-ui">{errors.category}</span>
            )}
          </FieldGroup>
        )}
        <QuantityUnitField
          label={PRODUCT_NET_CONTENT_LABEL}
          quantity={netContentQuantity}
          onQuantityChange={(value) => {
            setNetContentQuantity(value);
            if (errors.netContent) {
              setErrors((current) =>
                withFieldError(current, "netContent", netContentQuantityError(value)),
              );
            }
          }}
          unit={netContentUnit}
          onUnitChange={setNetContentUnit}
          options={NET_CONTENT_UNIT_OPTIONS}
          unitLabel={PRODUCT_NET_CONTENT_UNIT_LABEL}
          {...(errors.netContent ? { invalid: true, errorMessage: errors.netContent } : {})}
        />
        <FieldGroup label={PRODUCT_UNIT_LABEL} required>
          <OptionCardGroup
            label={PRODUCT_UNIT_LABEL}
            options={[
              {
                value: "UNIT",
                icon: <Package />,
                title: SALE_UNIT_OPTION_CONTENT.UNIT.title,
                helpText: SALE_UNIT_OPTION_CONTENT.UNIT.helpText,
              },
              {
                value: "KG",
                icon: <Scale />,
                title: SALE_UNIT_OPTION_CONTENT.KG.title,
                helpText: SALE_UNIT_OPTION_CONTENT.KG.helpText,
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
        </FieldGroup>
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
  const isOpen = target !== null;
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saleUnit, setSaleUnit] = useState<ProductSaleUnit>("UNIT");
  const [netContentQuantity, setNetContentQuantity] = useState("");
  const [netContentUnit, setNetContentUnit] = useState<NetContentUnit>(NET_CONTENT_DEFAULT_UNIT);
  const [version, setVersion] = useState(1);
  const [title, setTitle] = useState("");
  const chips = useBarcodeChips([]);
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
    () =>
      setNotice((current) =>
        current?.kind === "rateLimited" && current.raisedByGenerate ? null : current,
      ),
    PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  );

  useEffect(() => {
    if (isOpen && target) {
      setName(target.name);
      setCategoryId(target.categoryId);
      setSaleUnit(target.saleUnit);
      setNetContentQuantity(netContentQuantityText(target.netContent));
      setNetContentUnit(netContentUnitOf(target.netContent));
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
    const nameError = productNameError(name);
    const categoryError = categoryId ? undefined : PRODUCT_CATEGORY_REQUIRED;
    const pending = chips.commitPending();
    const barcodesError =
      pending.ok && pending.barcodes.length === 0 ? PRODUCT_BARCODE_REQUIRED : undefined;
    const netContentError = netContentQuantityError(netContentQuantity);
    setErrors(
      productFieldErrors(nameError, categoryError, undefined, barcodesError, netContentError),
    );
    if (!pending.ok || nameError || categoryError || barcodesError || netContentError) {
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
      netContent: netContentToSend(netContentQuantity, netContentUnit),
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
        setErrors((current) => withFieldError(current, "name", PRODUCT_NAME_REQUIRED));
      } else if (outcome.field === "categoryId") {
        setErrors((current) => withFieldError(current, "category", PRODUCT_CATEGORY_REQUIRED));
      } else if (outcome.field === "barcodes") {
        setErrors((current) =>
          withFieldError(current, "barcodes", barcodesRejectedError(sentBarcodes)),
        );
      } else if (outcome.field === "netContentQuantity") {
        setErrors((current) => withFieldError(current, "netContent", NET_CONTENT_QUANTITY_INVALID));
      } else if (outcome.field === "netContent") {
        setErrors((current) => withFieldError(current, "netContent", PRODUCT_NET_CONTENT_INVALID));
      } else {
        setNotice({ kind: "attemptFailed" });
      }
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "barcode_taken") {
      setErrors((current) => ({
        ...current,
        barcodes: barcodeTakenError(outcome.codes),
      }));
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "category_not_leaf") {
      const chosenCategoryName =
        categories.find((category) => category.id === categoryId)?.name ?? "";
      setErrors((current) =>
        withFieldError(
          current,
          "category",
          PRODUCT_CATEGORY_NOT_LEAF_ERROR({ category: chosenCategoryName }),
        ),
      );
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
      setNetContentQuantity(netContentQuantityText(fresh.netContent));
      setNetContentUnit(netContentUnitOf(fresh.netContent));
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
      context={PRODUCT_MODAL_EYEBROW}
      title={title}
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            isDisabled={submitting}
            onPress={onClose}
          >
            {CANCEL_LABEL}
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
              Recargar el producto
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
              Guardar los cambios
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
              title="No se pudo guardar el cambio"
              detail={TRY_AGAIN_DETAIL}
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={RATE_LIMITED_TITLE}
              detail={retryAfterDetail(notice.retryAfterSeconds)}
            />
          )}
          {notice?.kind === "staleVersion" && (
            <InlineNotice
              tone="error"
              icon={<RotateCcw />}
              title="Otra persona cambió este producto"
              detail="Mientras lo editabas se guardó otra versión. Tus cambios no se guardaron: recargá el producto para verla y volvé a hacerlos."
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este producto ya no existe"
            />
          )}
          {notice?.kind === "reloadFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudieron recargar los datos"
              detail={TRY_AGAIN_DETAIL}
            />
          )}
          <TextField
            kind="plain-text"
            label="Nombre"
            value={name}
            onChange={(value) => {
              setName(value);
              if (errors.name) {
                setErrors((current) => withFieldError(current, "name", productNameError(value)));
              }
            }}
            required
            {...(errors.name ? { invalid: true, errorMessage: errors.name } : {})}
          />
          {categoryOptions ? (
            <Select
              label={PRODUCT_CATEGORY_LABEL}
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
            <FieldGroup label={PRODUCT_CATEGORY_LABEL} required>
              {errors.category && (
                <span className="text-sm font-normal text-status-error-ui">{errors.category}</span>
              )}
            </FieldGroup>
          )}
          <QuantityUnitField
            label={PRODUCT_NET_CONTENT_LABEL}
            quantity={netContentQuantity}
            onQuantityChange={(value) => {
              setNetContentQuantity(value);
              if (errors.netContent) {
                setErrors((current) =>
                  withFieldError(current, "netContent", netContentQuantityError(value)),
                );
              }
            }}
            unit={netContentUnit}
            onUnitChange={setNetContentUnit}
            options={NET_CONTENT_UNIT_OPTIONS}
            unitLabel={PRODUCT_NET_CONTENT_UNIT_LABEL}
            {...(errors.netContent ? { invalid: true, errorMessage: errors.netContent } : {})}
          />
          <FieldGroup label={PRODUCT_UNIT_LABEL} required>
            <OptionCardGroup
              label={PRODUCT_UNIT_LABEL}
              options={[
                {
                  value: "UNIT",
                  icon: <Package />,
                  title: SALE_UNIT_OPTION_CONTENT.UNIT.title,
                  helpText: SALE_UNIT_OPTION_CONTENT.UNIT.helpText,
                },
                {
                  value: "KG",
                  icon: <Scale />,
                  title: SALE_UNIT_OPTION_CONTENT.KG.title,
                  helpText: SALE_UNIT_OPTION_CONTENT.KG.helpText,
                },
              ]}
              value={saleUnit}
              onChange={setSaleUnit}
              required
            />
          </FieldGroup>
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

function DeactivateProductModal({
  target,
  onClose,
  onDeactivated,
  onVanished,
  onSessionEnded,
  deactivateProduct,
}: DeactivateProductModalProps) {
  const isOpen = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<DeactivateNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (isOpen && target) {
      setTitle(`¿Desactivar ${target.name}?`);
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
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            isDisabled={submitting}
            onPress={onClose}
          >
            {CANCEL_LABEL}
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
              Actualizar la lista
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
              Desactivar
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-base text-ink">
          Deja de ofrecerse en el catálogo y en las cajas. Las ventas que ya lo incluyen no cambian.
        </p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo desactivar el producto"
            detail={TRY_AGAIN_DETAIL}
          />
        )}
        {notice?.kind === "alreadyInactive" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title="Ya estaba desactivado" />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={RATE_LIMITED_TITLE}
            detail={retryAfterDetail(notice.retryAfterSeconds)}
          />
        )}
      </div>
    </Modal>
  );
}

type LabelableProduct = { product: ProductSummary; code: string };

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

// The standard EAN-13 human-readable layout: first digit alone, then two halves of six digits.
function groupedEan13Digits(code: string): string {
  return `${code.slice(0, 1)} ${code.slice(1, 7)} ${code.slice(7, 13)}`;
}

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
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<PrintNotice | null>(null);
  const [printing, setPrinting] = useState(false);
  const [reloading, setReloading] = useState(false);
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
      link.download = "etiquetas.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking right after click() can cancel the download in Firefox and Safari, which read
      // the blob asynchronously.
      setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
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
      context={PRODUCT_MODAL_EYEBROW}
      title="Imprimir etiquetas"
      closable
      footer={
        <>
          <Button variant="secondary" size="large" icon={<X />} isDisabled={busy} onPress={onClose}>
            {CANCEL_LABEL}
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Download />}
            fullWidth
            isDisabled={busy || total === 0}
            onPress={() => void handleDownload()}
          >
            Descargar la hoja para imprimir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo generar la hoja"
            detail={TRY_AGAIN_DETAIL}
          />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={RATE_LIMITED_TITLE}
            detail={retryAfterDetail(notice.retryAfterSeconds)}
          />
        )}
        {notice?.kind === "productsChanged" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="La lista de productos cambió"
            detail="Recargá para ver los productos actualizados antes de imprimir."
          />
        )}
        {notice?.kind === "reloadFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo recargar la lista"
            detail={TRY_AGAIN_DETAIL}
          />
        )}
        {offersReload && (
          <Button variant="secondary" isDisabled={reloading} onPress={() => void handleReload()}>
            Recargar la lista
          </Button>
        )}
        <p className="text-base text-ink">
          Productos con código interno. Elegí cuántas etiquetas va a llevar cada uno.
        </p>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-bone px-4 py-8 text-center">
            <Package aria-hidden="true" className="size-6 text-ink-secondary" />
            <p className="text-base font-bold text-ink">
              No hay productos activos con código interno
            </p>
            <p className="text-sm text-ink-secondary">
              Generá uno desde el formulario de un producto activo.
            </p>
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
                        aria-label={`Restar una etiqueta de ${product.name}`}
                        isDisabled={count === 0}
                        onPress={() => changeCount(product.id, -1)}
                      />
                      <span className="w-8 text-center font-mono text-base text-ink">{count}</span>
                      <IconButton
                        icon={<Plus />}
                        aria-label={`Sumar una etiqueta a ${product.name}`}
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
              // <fieldset> carries the implicit "group" role a div would need role="group" for;
              // Tailwind's preflight strips its native border/padding/margin.
              <fieldset
                aria-label="Vista previa de la etiqueta"
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
                    {plural(total, { one: "1 etiqueta", other: `${total} etiquetas` })}
                  </p>
                  <p className="text-sm text-ink-secondary">
                    Hoja autoadhesiva para cualquier impresora común.
                  </p>
                </div>
              </fieldset>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

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

  const latestLoad = useRef(0);

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

  const categoryLabels = useMemo(() => categoryPathLabels(categories), [categories]);

  const categoryFilterOptions = useMemo(() => {
    const leafIds = new Set(leafCategories(categories).map((category) => category.id));
    const leaves = categoriesInTreeOrder(categories, "ascending").filter((category) =>
      leafIds.has(category.id),
    );
    return [
      { value: "ALL" as const, label: "Todas" },
      ...leaves.map((category) => ({
        value: category.id,
        label: categoryLabels.get(category.id) ?? category.name,
      })),
    ] as [{ value: CategoryFilter; label: string }, ...{ value: CategoryFilter; label: string }[]];
  }, [categories, categoryLabels]);

  const unitFilterOptions = [
    { value: "ALL" as const, label: "Todas" },
    { value: "UNIT" as const, label: UNIT_OPTION_LABELS.UNIT },
    { value: "KG" as const, label: UNIT_OPTION_LABELS.KG },
  ] as const;

  const statusFilterOptions = [
    { value: "active" as const, label: "Activos" },
    { value: "inactive" as const, label: "Inactivos" },
    { value: "all" as const, label: "Todos" },
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
      title: "PRODUCTO",
      sortable: true,
      defaultDirection: "ascending",
      render: (item: ProductSummary) => item.name,
    },
    {
      key: "category",
      title: "CATEGORÍA",
      render: (item: ProductSummary) => categoryLabels.get(item.categoryId) ?? item.categoryName,
    },
    {
      key: "unit",
      title: "UNIDAD",
      render: (item: ProductSummary) => unitLabel(item.saleUnit),
    },
    {
      key: "status",
      title: "ESTADO",
      render: (item: ProductSummary) =>
        item.active ? (
          <StatusIndicator tone="success">Activo</StatusIndicator>
        ) : (
          <StatusIndicator tone="neutral">Inactivo</StatusIndicator>
        ),
    },
    {
      key: "actions",
      kind: "actions",
      srLabel: "Acciones",
      actions: [
        (item: ProductSummary) => ({
          icon: <Pencil />,
          "aria-label": `Editar el producto ${item.name}`,
          onPress: () => setEditTarget(item),
        }),
        (item: ProductSummary) =>
          item.active
            ? {
                icon: <Ban />,
                "aria-label": `Desactivar el producto ${item.name}`,
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
              <p className="text-ink-secondary text-sm">Catálogo</p>
              <h1 className="font-bold text-2xl text-brand-blue-strong">{HEADING}</h1>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                icon={<Printer />}
                isDisabled={list.kind !== "loaded"}
                onPress={() => setPrintModalOpen(true)}
              >
                Imprimir etiquetas
              </Button>
              <Button variant="primary" icon={<Plus />} onPress={() => setNewModalOpen(true)}>
                Nuevo producto
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
              title="No pudimos abrir los productos"
              detail="Probá de nuevo en unos minutos."
            />
            <Button variant="secondary" onPress={() => void load()}>
              {RETRY_LABEL}
            </Button>
          </>
        )}
        {list.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={RATE_LIMITED_TITLE}
              detail={retryAfterDetail(list.retryAfterSeconds)}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {RETRY_LABEL}
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
                  placeholder="Buscar por nombre o código de barras"
                  icon={<Search />}
                />
              </div>
              <ListFilter
                label="Categoría:"
                options={categoryFilterOptions}
                value={categoryFilter}
                onChange={setCategoryFilter}
              />
              <ListFilter
                label="Unidad:"
                options={unitFilterOptions}
                value={unitFilter}
                onChange={setUnitFilter}
              />
              <ListFilter
                label="Estado:"
                options={statusFilterOptions}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
            <Table
              aria-label={HEADING}
              columns={columns}
              sort={sort}
              onSortChange={setSort}
              loading={list.kind === "loading" ? "initial" : false}
              rows={filtered.map((product) => ({ id: product.id, item: product }))}
              empty={
                products.length === 0
                  ? {
                      icon: <Package />,
                      ...PRODUCTS_EMPTY_STATE[statusFilter],
                      tone: "blank",
                    }
                  : {
                      icon: <SearchX />,
                      title: "Sin resultados",
                      detail: "Probá con otro nombre o código de barras.",
                      tone: "filtered",
                    }
              }
              footer={
                <p className="text-ink-secondary text-sm">
                  {productsCountText({ count: filtered.length, status: statusFilter })}
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
