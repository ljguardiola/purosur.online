import {
  type CategorySummary,
  type ProductSummary,
  productCreationBodySchema,
  productEditBodySchema,
} from "@purosur/contracts";
import {
  barcodeListProblem,
  ean13Modules,
  isInternalBarcode,
  LABELS_MAX_COUNT_PER_PRODUCT,
  LABELS_MAX_TOTAL_COUNT,
  type NetContentUnit,
} from "@purosur/domain";
import {
  Button,
  EmptyState,
  FieldGroup,
  IconButton,
  InlineNotice,
  ListFilter,
  Modal,
  type Option,
  type Options,
  plural,
  SearchField,
  StatusIndicator,
  sortedItems,
  Table,
  type TableSort,
  tableRows,
  textOrder,
} from "@purosur/ui";
import { deepEqual } from "@tanstack/react-router";
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
import { useSendToMyAccount } from "../access/send-to-my-account";
import { useCloudForm } from "../platform/cloud-form";
import { useFieldContext } from "../platform/cloud-form-context";
import { fieldErrorMessage, SharedFieldError } from "../platform/cloud-form-fields";
import { cloudTableState } from "../platform/cloud-table-state";
import { combineCloudData } from "../platform/combine-cloud-data";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useLatestRef } from "../platform/use-latest-ref";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import {
  type ProductReload,
  useCategoriesQuery,
  useProductsQuery,
  useRefreshCatalog,
  useReloadProduct,
} from "./catalog-queries";
import { categoriesInTreeOrder, categoryPathLabels, leafCategories } from "./category-path";
import {
  type BarcodeListValue,
  barcodeProblemMessage,
  EMPTY_PRODUCT_FORM,
  PRODUCT_EDIT_FIELDS,
  PRODUCT_FIELDS,
  PRODUCT_MESSAGES,
  productEditRequestFrom,
  productFormValues,
  productRequestFrom,
} from "./product-form";
import type {
  createProduct,
  deactivateProduct,
  editProduct,
  generateInternalBarcode,
  ProductSaleUnit,
  ProductStatusFilter,
  printLabels,
} from "./products-api";
import type { ProductsListScreenServices } from "./products-list-services";
import type { ProductsListFilters } from "./routes";

export type ProductsListScreenProps = {
  filters: ProductsListFilters;
  onFiltersChange: (filters: ProductsListFilters) => void;
  onSessionEnded: () => void;
  services: ProductsListScreenServices;
};

const NO_PRODUCTS: ProductSummary[] = [];
const NO_CATEGORIES: CategorySummary[] = [];

type CategoryFilter = "ALL" | string;
type UnitFilter = "ALL" | ProductSaleUnit;

// Only reachable by a race: the category gains a subcategory of its own between loading this
// form and submitting it.
const PRODUCT_CATEGORY_NOT_LEAF_ERROR = (params: { category: string }) =>
  `"${params.category}" tiene subcategorías. Elegí una de ellas.`;
const SALE_UNIT_OPTIONS = [
  {
    value: "UNIT",
    icon: <Package />,
    label: "Por unidad",
    description: "Se vende de a uno",
  },
  {
    value: "KG",
    icon: <Scale />,
    label: "Por peso",
    description: "Se pesa en la balanza",
  },
] as const;
const PRODUCT_BARCODE_TAKEN_UNNAMED = "Alguno de los códigos ya es de otro producto.";
const PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED =
  "No se pudo generar el código interno. Probá de nuevo.";

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
  active: { title: "No hay productos activos", description: "Creá uno para verlo en la lista." },
  inactive: { title: "No hay productos inactivos" },
  all: {
    title: "Todavía no hay productos",
    description: "Creá el primero para verlo en la lista.",
  },
} satisfies Record<ProductStatusFilter, { title: string; description?: string }>;

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

const NET_CONTENT_UNIT_OPTIONS: Options<Option<NetContentUnit>> = [
  { value: "G", label: NET_CONTENT_UNIT_OPTION_LABELS.G },
  { value: "KG", label: NET_CONTENT_UNIT_OPTION_LABELS.KG },
  { value: "ML", label: NET_CONTENT_UNIT_OPTION_LABELS.ML },
  { value: "L", label: NET_CONTENT_UNIT_OPTION_LABELS.L },
  { value: "UNIT", label: NET_CONTENT_UNIT_OPTION_LABELS.UNIT },
];

const productNameOrder = textOrder((product: ProductSummary) => product.name);

// Full paths disambiguate leaves that share a name under different parents.
function categorySelectOptions(categories: CategorySummary[]): Options<Option<string>> | undefined {
  const leafIds = new Set(leafCategories(categories).map((category) => category.id));
  if (leafIds.size === 0) {
    return undefined;
  }
  const labels = categoryPathLabels(categories);
  const leaves = categoriesInTreeOrder(categories).filter((category) => leafIds.has(category.id));
  const [first, ...rest] = leaves.map((category) => ({
    value: category.id,
    label: labels.get(category.id) ?? category.name,
  }));
  if (!first) {
    throw new Error("no category to offer: leaves.length > 0 was already checked");
  }
  return [first, ...rest];
}

const barcodeActionClassName =
  "flex h-control-xl flex-1 items-center justify-center gap-2 rounded-lg px-3 text-body font-bold " +
  "text-text-accent inset-ring-2 inset-ring-action " +
  "outline-none transition-background";

const scanControlClassName =
  `${barcodeActionClassName} relative min-w-0 cursor-text hover:bg-surface-subtle ` +
  "focus-within:focus-ring";

// `enabled:` keeps the hover fill off a disabled button.
const generateButtonClassName =
  `${barcodeActionClassName} enabled:hover:bg-surface-subtle ` +
  "focus-visible:focus-ring disabled:opacity-disabled";

type BarcodeListControl = {
  list: BarcodeListValue;
  latest: () => BarcodeListValue;
  setList: (next: BarcodeListValue) => void;
};

function scanProblemMessage(code: string, listed: string[]): string | undefined {
  return barcodeProblemMessage(barcodeListProblem([...listed, code]));
}

function barcodeTakenError(codes: string[]): string {
  return codes.length > 0 ? barcodeTakenText({ codes }) : PRODUCT_BARCODE_TAKEN_UNNAMED;
}

function hasInternalBarcode(barcodes: string[]): boolean {
  return barcodes.some(isInternalBarcode);
}

function useBarcodeChips({ list, latest, setList }: BarcodeListControl) {
  const [scanError, setScanError] = useState<string | undefined>(undefined);

  const reset = useCallback(() => setScanError(undefined), []);

  function changeScanInput(value: string) {
    setList({ ...list, scan: value });
    setScanError(undefined);
  }

  function remove(code: string) {
    const codes = list.codes.filter((existing) => existing !== code);
    setList({ ...list, codes });
    setScanError((current) =>
      current === undefined ? undefined : scanProblemMessage(list.scan.trim(), codes),
    );
  }

  function handleScanKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const code = list.scan.trim();
    if (code === "") {
      return;
    }
    const problem = scanProblemMessage(code, list.codes);
    if (problem) {
      setScanError(problem);
      return;
    }
    setList({ codes: [...list.codes, code], scan: "" });
    setScanError(undefined);
  }

  // Checked before allocating a code from the cloud, so a full list never wastes one.
  function refuseWhenFull(): boolean {
    const problem = scanProblemMessage("", list.codes);
    if (problem === undefined) {
      return false;
    }
    setScanError(problem);
    return true;
  }

  // The cloud already allocated and confirmed this code unique, so unlike a scanned one it
  // skips the spaces/length checks.
  function addGenerated(code: string): boolean {
    const current = latest();
    const problem = scanProblemMessage("", current.codes);
    if (problem !== undefined) {
      setScanError(problem);
      return false;
    }
    if (!current.codes.includes(code)) {
      setList({ ...current, codes: [...current.codes, code] });
    }
    return true;
  }

  return {
    codes: list.codes,
    scanError,
    reset,
    changeScanInput,
    remove,
    handleScanKeyDown,
    refuseWhenFull,
    addGenerated,
  };
}

type BarcodeChipsState = ReturnType<typeof useBarcodeChips>;

type BarcodeChipsProps = {
  chips: BarcodeChipsState;
  onGenerate: () => void;
  generateDisabled: boolean;
  generateError: string | undefined;
};

function BarcodeChips({ chips, onGenerate, generateDisabled, generateError }: BarcodeChipsProps) {
  const field = useFieldContext<BarcodeListValue>();
  const { codes, scan } = field.state.value;
  const error = fieldErrorMessage(field.state.meta.errors) ?? chips.scanError;
  const errorId = useId();
  const generateErrorId = useId();
  const [scanFocused, setScanFocused] = useState(false);

  return (
    <FieldGroup label="Códigos de barras" required>
      {codes.length > 0 && (
        <div className="flex flex-col gap-1">
          {codes.map((code) => (
            <div
              key={code}
              className="flex h-control-xl items-center gap-2 rounded-lg bg-surface-subtle px-3"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-detail text-text">
                {code}
              </span>
              <IconButton
                icon={<X />}
                aria-label={`Quitar el código ${code}`}
                onPress={() => chips.remove(code)}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <label className={scanControlClassName}>
          {!scan && !scanFocused && (
            <span
              aria-hidden="true"
              className="pointer-events-none flex min-w-0 items-center justify-center gap-2"
            >
              <ScanBarcode className="size-icon-md shrink-0" />
              <span className="truncate">Escanear otro código</span>
            </span>
          )}
          <input
            className="absolute inset-0 size-full rounded-lg bg-transparent px-3 text-center outline-none"
            value={scan}
            onChange={(event) => chips.changeScanInput(event.target.value)}
            onKeyDown={chips.handleScanKeyDown}
            onFocus={() => setScanFocused(true)}
            onBlur={() => setScanFocused(false)}
            aria-label="Escanear otro código"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </label>
        <button
          type="button"
          className={generateButtonClassName}
          disabled={generateDisabled}
          onClick={onGenerate}
          aria-describedby={generateError ? generateErrorId : undefined}
        >
          <Barcode aria-hidden="true" className="size-icon-md shrink-0" />
          <span className="truncate">Generar código interno</span>
        </button>
      </div>
      {generateError ? (
        <span id={generateErrorId} role="alert" className="text-detail text-error">
          {generateError}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="text-detail text-error">
          {error}
        </span>
      ) : null}
    </FieldGroup>
  );
}

function useGenerateInternalBarcode(
  chips: Pick<BarcodeChipsState, "codes" | "refuseWhenFull" | "addGenerated">,
  generateInternalBarcodeService: typeof generateInternalBarcode,
  onSessionEnded: () => void,
  onRateLimited: (retryAfterSeconds: number) => void,
  clearRateLimited: () => void,
  generateFailedMessage: string,
) {
  const sendToMyAccount = useSendToMyAccount();
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
      chips.addGenerated(outcome.code);
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

  const disabled = generating || hasInternalBarcode(chips.codes);

  return { generating, generateError, disabled, reset, handleGenerate };
}

function categoryNameOf(categories: CategorySummary[], id: string): string {
  return categories.find((category) => category.id === id)?.name ?? "";
}

type NewProductModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onSessionEnded: () => void;
  createProduct: typeof createProduct;
  generateInternalBarcode: typeof generateInternalBarcode;
  categories: CategorySummary[];
};

function NewProductModal({
  open,
  onClose,
  onCreated,
  onSessionEnded,
  createProduct,
  generateInternalBarcode,
  categories,
}: NewProductModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<
    | { kind: "attemptFailed" }
    | { kind: "rateLimited"; retryAfterSeconds: number; raisedByGenerate?: true }
    | null
  >(null);
  const { form, submit, submitting, values, reset } = useCloudForm({
    defaultValues: EMPTY_PRODUCT_FORM,
    request: { schema: productCreationBodySchema, from: productRequestFrom },
    fields: PRODUCT_FIELDS,
    messages: PRODUCT_MESSAGES,
    onSubmit: async (_request, { parsed, showFieldError, showWireFieldError }) => {
      if (!parsed) {
        setNotice({ kind: "attemptFailed" });
        return;
      }
      setNotice(null);
      const outcome = await createProduct(parsed);
      if (outcome.kind === "ok") {
        onCreated();
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
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "barcode_taken") {
        showFieldError("barcodes", barcodeTakenError(outcome.codes));
        return;
      }
      if (outcome.kind === "category_not_leaf") {
        showFieldError(
          "categoryId",
          PRODUCT_CATEGORY_NOT_LEAF_ERROR({
            category: categoryNameOf(categories, parsed.categoryId),
          }),
        );
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });
  const chips = useBarcodeChips({
    list: values.barcodes,
    latest: () => form.state.values.barcodes,
    setList: (next) => form.setFieldValue("barcodes", next),
  });
  const generate = useGenerateInternalBarcode(
    chips,
    generateInternalBarcode,
    onSessionEnded,
    (retryAfterSeconds) =>
      setNotice({ kind: "rateLimited", retryAfterSeconds, raisedByGenerate: true }),
    () =>
      setNotice((current) =>
        current?.kind === "rateLimited" && current.raisedByGenerate ? null : current,
      ),
    PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  );

  useEffect(() => {
    if (open) {
      reset();
      chips.reset();
      setNotice(null);
      generate.reset();
    }
  }, [open, reset, chips.reset, generate.reset]);

  const categoryOptions = categorySelectOptions(categories);

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
      icon={<PackagePlus />}
      context="Catálogo · Productos"
      title="Nuevo producto"
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={onClose}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            disabled={submitting}
            onPress={() => void submit()}
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
        <form.AppField name="name">
          {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
        </form.AppField>
        <form.AppField name="categoryId">
          {(field) =>
            categoryOptions ? (
              <field.Select
                label="Categoría"
                placeholder="Elegí una categoría"
                options={categoryOptions}
                required
              />
            ) : (
              <FieldGroup label="Categoría" required>
                <SharedFieldError>{() => null}</SharedFieldError>
              </FieldGroup>
            )
          }
        </form.AppField>
        <form.AppField name="netContent">
          {(field) => (
            <field.QuantityUnitField
              label="Contenido neto"
              options={NET_CONTENT_UNIT_OPTIONS}
              unitLabel="Unidad"
            />
          )}
        </form.AppField>
        <FieldGroup label="Unidad de venta" required>
          <form.AppField name="saleUnit">
            {(field) => (
              <field.OptionCardGroup label="Unidad de venta" options={SALE_UNIT_OPTIONS} required />
            )}
          </form.AppField>
        </FieldGroup>
        <form.AppField name="barcodes">
          {() => (
            <BarcodeChips
              chips={chips}
              onGenerate={() => void generate.handleGenerate()}
              generateDisabled={generate.disabled}
              generateError={generate.generateError}
            />
          )}
        </form.AppField>
      </div>
    </Modal>
  );
}

type EditProductModalProps = {
  target: ProductSummary | null;
  onClose: () => void;
  onSaved: () => void;
  onSessionEnded: () => void;
  reload: (id: string) => Promise<ProductReload>;
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
  reload,
  editProduct,
  generateInternalBarcode,
  categories,
}: EditProductModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const targetRef = useLatestRef(target);
  const { form, submit, submitting, values, reset } = useCloudForm({
    defaultValues: { ...EMPTY_PRODUCT_FORM, version: 1 },
    request: { schema: productEditBodySchema, from: productEditRequestFrom },
    fields: PRODUCT_EDIT_FIELDS,
    messages: PRODUCT_MESSAGES,
    onSubmit: async (_request, { parsed, showFieldError, showWireFieldError }) => {
      const current = targetRef.current;
      if (!current) {
        return;
      }
      if (!parsed) {
        setNotice({ kind: "attemptFailed" });
        return;
      }
      setNotice(null);
      const outcome = await editProduct(current.id, parsed);
      if (outcome.kind === "ok") {
        onSaved();
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
        return;
      }
      if (outcome.kind === "stale_version") {
        setNotice({ kind: "staleVersion" });
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "barcode_taken") {
        showFieldError("barcodes", barcodeTakenError(outcome.codes));
        return;
      }
      if (outcome.kind === "category_not_leaf") {
        showFieldError(
          "categoryId",
          PRODUCT_CATEGORY_NOT_LEAF_ERROR({
            category: categoryNameOf(categories, parsed.categoryId),
          }),
        );
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });
  const chips = useBarcodeChips({
    list: values.barcodes,
    latest: () => form.state.values.barcodes,
    setList: (next) => form.setFieldValue("barcodes", next),
  });
  const generate = useGenerateInternalBarcode(
    chips,
    generateInternalBarcode,
    onSessionEnded,
    (retryAfterSeconds) =>
      setNotice({ kind: "rateLimited", retryAfterSeconds, raisedByGenerate: true }),
    () =>
      setNotice((current) =>
        current?.kind === "rateLimited" && current.raisedByGenerate ? null : current,
      ),
    PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  );

  useEffect(() => {
    if (open && target) {
      reset(productFormValues(target));
      setTitle(target.name);
      chips.reset();
      setNotice(null);
      setReloading(false);
      generate.reset();
    }
  }, [open, target, reset, chips.reset, generate.reset]);

  const categoryOptions = categorySelectOptions(categories);

  async function handleReload() {
    const current = targetRef.current;
    if (!current) {
      return;
    }
    setReloading(true);
    const outcome = await reload(current.id);
    if (outcome.kind === "found") {
      reset(productFormValues(outcome.product));
      setTitle(outcome.product.name);
      chips.reset();
      setNotice(null);
      setReloading(false);
      generate.reset();
      return;
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
      setReloading(false);
      return;
    }
    if (outcome.kind === "list_failed") {
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

  const offersReload = notice?.kind === "staleVersion" || notice?.kind === "reloadFailed";
  const busy = submitting || reloading;

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
      context="Catálogo · Productos"
      title={title}
      closable
      footer={
        <>
          <Button variant="secondary" size="large" icon={<X />} disabled={busy} onPress={onClose}>
            Cancelar
          </Button>
          {offersReload ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              disabled={busy}
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
              disabled={busy}
              onPress={() => void submit()}
            >
              Guardar los cambios
            </Button>
          )}
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo guardar el cambio"
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
          {notice?.kind === "staleVersion" && (
            <InlineNotice
              tone="error"
              icon={<RotateCcw />}
              title="Otra persona cambió este producto"
              description="Mientras lo editabas se guardó otra versión. Tus cambios no se guardaron: recargá el producto para verla y volvé a hacerlos."
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
              description="Probá de nuevo."
            />
          )}
          <form.AppField name="name">
            {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
          </form.AppField>
          <form.AppField name="categoryId">
            {(field) =>
              categoryOptions ? (
                <field.Select label="Categoría" options={categoryOptions} required />
              ) : (
                <FieldGroup label="Categoría" required>
                  <SharedFieldError>{() => null}</SharedFieldError>
                </FieldGroup>
              )
            }
          </form.AppField>
          <form.AppField name="netContent">
            {(field) => (
              <field.QuantityUnitField
                label="Contenido neto"
                options={NET_CONTENT_UNIT_OPTIONS}
                unitLabel="Unidad"
              />
            )}
          </form.AppField>
          <FieldGroup label="Unidad de venta" required>
            <form.AppField name="saleUnit">
              {(field) => (
                <field.OptionCardGroup
                  label="Unidad de venta"
                  options={SALE_UNIT_OPTIONS}
                  required
                />
              )}
            </form.AppField>
          </FieldGroup>
          <form.AppField name="barcodes">
            {() => (
              <BarcodeChips
                chips={chips}
                onGenerate={() => void generate.handleGenerate()}
                generateDisabled={generate.disabled}
                generateError={generate.generateError}
              />
            )}
          </form.AppField>
        </div>
      ) : null}
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
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<DeactivateNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const targetRef = useLatestRef(target);

  useEffect(() => {
    if (open && target) {
      setTitle(`¿Desactivar ${target.name}?`);
      setNotice(null);
      setSubmitting(false);
    }
  }, [open, target]);

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
      open={open}
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
            disabled={submitting}
            onPress={onClose}
          >
            Cancelar
          </Button>
          {alreadyGone ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              disabled={submitting}
              onPress={onVanished}
            >
              Actualizar la lista
            </Button>
          ) : (
            <Button
              variant="primary"
              destructive
              size="large"
              icon={<Ban />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Desactivar
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">
          Deja de ofrecerse en el catálogo y en las cajas. Las ventas que ya lo incluyen no cambian.
        </p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo desactivar el producto"
            description="Probá de nuevo."
          />
        )}
        {notice?.kind === "alreadyInactive" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title="Ya estaba desactivado" />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title="Demasiadas solicitudes"
            description={retryAfterDetail(notice.retryAfterSeconds)}
          />
        )}
      </div>
    </Modal>
  );
}

type LabelableProduct = { product: ProductSummary; code: string };

function labelableProducts(products: ProductSummary[]): LabelableProduct[] {
  const labelable = products.flatMap((product) => {
    if (!product.active) {
      return [];
    }
    const code = product.barcodes.find(isInternalBarcode);
    return code ? [{ product, code }] : [];
  });
  return sortedItems(labelable, {
    order: textOrder((labelableProduct) => labelableProduct.product.name),
    direction: "ascending",
  });
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
      className="h-10 w-full text-text"
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
  | { kind: "rateLimited"; retryAfterSeconds: number };

type PrintLabelsModalProps = {
  open: boolean;
  onClose: () => void;
  onSessionEnded: () => void;
  products: ProductSummary[];
  onReload: () => Promise<void>;
  printLabels: typeof printLabels;
};

function PrintLabelsModal({
  open,
  onClose,
  onSessionEnded,
  products,
  onReload,
  printLabels,
}: PrintLabelsModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<PrintNotice | null>(null);
  const [printing, setPrinting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const printRequestIdRef = useRef(0);

  useEffect(() => {
    printRequestIdRef.current += 1;
    if (open) {
      setCounts({});
      setNotice(null);
      setPrinting(false);
      setReloading(false);
    }
  }, [open]);

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
    await onReload();
    if (requestId !== printRequestIdRef.current) {
      return;
    }
    setCounts({});
    setNotice(null);
    setReloading(false);
  }

  const offersReload = notice?.kind === "productsChanged";

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
      icon={<Printer />}
      context="Catálogo · Productos"
      title="Imprimir etiquetas"
      closable
      footer={
        <>
          <Button variant="secondary" size="large" icon={<X />} disabled={busy} onPress={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Download />}
            fullWidth
            disabled={busy || total === 0}
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
        {notice?.kind === "productsChanged" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="La lista de productos cambió"
            description="Recargá para ver los productos actualizados antes de imprimir."
          />
        )}
        {offersReload ? (
          <Button variant="secondary" disabled={reloading} onPress={() => void handleReload()}>
            Recargar la lista
          </Button>
        ) : null}
        {rows.length === 0 ? (
          <EmptyState
            variant="blank"
            icon={<Package />}
            title="No hay productos activos con código interno"
            description="Generá uno desde el formulario de un producto activo."
          />
        ) : (
          <>
            <p className="text-body text-text">
              Productos con código interno. Elegí cuántas etiquetas va a llevar cada uno.
            </p>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {rows.map(({ product, code }) => {
                const count = counts[product.id] ?? 0;
                return (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-surface-subtle px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-body font-bold text-text">{product.name}</span>
                      <span className="truncate font-mono text-detail text-text-subtle">
                        {code}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <IconButton
                        icon={<Minus />}
                        aria-label={`Restar una etiqueta de ${product.name}`}
                        disabled={count === 0}
                        onPress={() => changeCount(product.id, -1)}
                      />
                      <span className="w-8 text-center font-mono text-body text-text">{count}</span>
                      <IconButton
                        icon={<Plus />}
                        aria-label={`Sumar una etiqueta a ${product.name}`}
                        disabled={
                          count === LABELS_MAX_COUNT_PER_PRODUCT || total >= LABELS_MAX_TOTAL_COUNT
                        }
                        onPress={() => changeCount(product.id, 1)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {previewRow ? (
              // <fieldset> carries the implicit "group" role a div would need role="group" for;
              // Tailwind's preflight strips its native border/padding/margin.
              <fieldset
                aria-label="Vista previa de la etiqueta"
                className="flex items-center gap-4 rounded-lg border border-border p-3"
              >
                <div className="flex w-36 shrink-0 flex-col items-center gap-2 rounded-sm border border-border p-3">
                  <span className="line-clamp-2 text-center text-caption font-bold text-text">
                    {previewRow.product.name}
                  </span>
                  <LabelPreviewBars code={previewRow.code} />
                  <span className="font-mono text-caption text-text">
                    {groupedEan13Digits(previewRow.code)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-heading text-text-accent">
                    {plural(total, { one: "1 etiqueta", other: `${total} etiquetas` })}
                  </p>
                  <p className="text-detail text-text-subtle">
                    Hoja autoadhesiva para cualquier impresora común.
                  </p>
                </div>
              </fieldset>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}

export function ProductsListScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: ProductsListScreenProps) {
  const {
    fetchProducts: fetchProductsService,
    createProduct: createProductService,
    editProduct: editProductService,
    deactivateProduct: deactivateProductService,
    fetchCategories: fetchCategoriesService,
    generateInternalBarcode: generateInternalBarcodeService,
    printLabels: printLabelsService,
  } = services;
  const [search, setSearch] = useState(filters.search);
  const [chosenCategoryFilter, setChosenCategoryFilter] = useState<CategoryFilter>(
    filters.category,
  );
  const [unitFilter, setUnitFilter] = useState<UnitFilter>(filters.unit);
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>(filters.status);
  const [sort, setSort] = useState<TableSort<"product">>({
    column: "product",
    direction: filters.sort,
  });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductSummary | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ProductSummary | null>(null);
  const onFiltersChangeRef = useLatestRef(onFiltersChange);
  const refreshCatalog = useRefreshCatalog();
  const reloadProduct = useReloadProduct({
    status: statusFilter,
    fetchProducts: fetchProductsService,
  });

  const productsData = useProductsQuery({
    status: statusFilter,
    fetchProducts: fetchProductsService,
    onSessionEnded,
  });
  const categoriesData = useCategoriesQuery({
    fetchCategories: fetchCategoriesService,
    onSessionEnded,
  });
  const data = combineCloudData(productsData, categoriesData);
  const [products, categories] =
    data.status === "loaded" ? data.value : [NO_PRODUCTS, NO_CATEGORIES];

  useEffect(() => {
    if (data.status === "failed") {
      setPrintModalOpen(false);
      setEditTarget(null);
    }
  }, [data.status]);

  const offeredCategoryIds = new Set(leafCategories(categories).map(({ id }) => id));
  const categoryFilter =
    data.status === "loaded" &&
    chosenCategoryFilter !== "ALL" &&
    !offeredCategoryIds.has(chosenCategoryFilter)
      ? "ALL"
      : chosenCategoryFilter;

  useEffect(() => {
    const shown: ProductsListFilters = {
      search,
      category: categoryFilter,
      unit: unitFilter,
      status: statusFilter,
      sort: sort.direction,
    };
    if (!deepEqual(shown, filters)) {
      onFiltersChangeRef.current(shown);
    }
  }, [
    search,
    categoryFilter,
    unitFilter,
    statusFilter,
    sort.direction,
    filters,
    onFiltersChangeRef,
  ]);

  const categoryLabels = categoryPathLabels(categories);

  const categoryFilterOptions = [
    { value: "ALL" as const, label: "Todas" },
    ...categoriesInTreeOrder(categories)
      .filter((category) => offeredCategoryIds.has(category.id))
      .map((category) => ({
        value: category.id,
        label: categoryLabels.get(category.id) ?? category.name,
      })),
  ] as [{ value: CategoryFilter; label: string }, ...{ value: CategoryFilter; label: string }[]];

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

  const { rows, matchCount } = tableRows({
    items: products,
    id: (product) => product.id,
    search: { text: search, in: (product) => [product.name, ...product.barcodes] },
    filter: (product) =>
      (categoryFilter === "ALL" || product.categoryId === categoryFilter) &&
      (unitFilter === "ALL" || product.saleUnit === unitFilter),
    sort: { by: sort, orders: { product: productNameOrder } },
  });

  const columns = [
    {
      key: "product",
      header: "Producto",
      sortable: true,
      defaultDirection: "ascending",
      render: (item: ProductSummary) => item.name,
    },
    {
      key: "category",
      header: "Categoría",
      render: (item: ProductSummary) => categoryLabels.get(item.categoryId) ?? item.categoryName,
    },
    {
      key: "unit",
      header: "Unidad",
      render: (item: ProductSummary) => unitLabel(item.saleUnit),
    },
    {
      key: "status",
      header: "Estado",
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
      header: "Acciones",
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

  function closeDeactivationAndRefresh() {
    setDeactivateTarget(null);
    void refreshCatalog();
  }

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Catálogo</p>
              <ScreenTitle>Productos</ScreenTitle>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                icon={<Printer />}
                dataStatus={data.status}
                onPress={() => setPrintModalOpen(true)}
              >
                Imprimir etiquetas
              </Button>
              <Button
                variant="primary"
                icon={<Plus />}
                dataStatus={data.status}
                onPress={() => setNewModalOpen(true)}
              >
                Nuevo producto
              </Button>
            </div>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-105">
            <SearchField
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
            onChange={setChosenCategoryFilter}
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
          aria-label="Productos"
          columns={columns}
          sort={sort}
          onSortChange={setSort}
          {...cloudTableState(data, "los productos")}
          rows={rows}
          empty={
            products.length === 0
              ? {
                  icon: <Package />,
                  ...PRODUCTS_EMPTY_STATE[statusFilter],
                  variant: "blank",
                }
              : {
                  icon: <SearchX />,
                  title: "Sin resultados",
                  description: "Probá con otro nombre o código de barras.",
                  variant: "filtered",
                }
          }
          footer={
            matchCount === 0 ? undefined : (
              <p className="text-text-subtle text-detail">
                {productsCountText({ count: matchCount, status: statusFilter })}
              </p>
            )
          }
        />
      </ScreenLayout>
      <NewProductModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={() => {
          setNewModalOpen(false);
          void refreshCatalog();
        }}
        onSessionEnded={onSessionEnded}
        createProduct={createProductService}
        generateInternalBarcode={generateInternalBarcodeService}
        categories={categories}
      />
      {data.status === "loaded" ? (
        <EditProductModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refreshCatalog();
          }}
          onSessionEnded={onSessionEnded}
          reload={reloadProduct}
          editProduct={editProductService}
          generateInternalBarcode={generateInternalBarcodeService}
          categories={data.value[1]}
        />
      ) : null}
      <DeactivateProductModal
        target={deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onDeactivated={closeDeactivationAndRefresh}
        onVanished={closeDeactivationAndRefresh}
        onSessionEnded={onSessionEnded}
        deactivateProduct={deactivateProductService}
      />
      <PrintLabelsModal
        open={printModalOpen && data.status === "loaded"}
        onClose={() => setPrintModalOpen(false)}
        onSessionEnded={onSessionEnded}
        products={products}
        onReload={refreshCatalog}
        printLabels={printLabelsService}
      />
    </>
  );
}
