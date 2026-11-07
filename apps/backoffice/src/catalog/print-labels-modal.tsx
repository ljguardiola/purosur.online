import {
  type BrandSummary,
  labelSheetBodySchema,
  type PrinterLabelSize,
  type ProductSummary,
  printerLabelSizeSchema,
} from "@purosur/contracts";
import {
  Button,
  EmptyState,
  formatNumber,
  IconButton,
  InlineNotice,
  Modal,
  plural,
  sortedItems,
  textOrder,
  useRequestForm,
} from "@purosur/ui";
import { Download, Minus, Package, Plus, Printer, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { downloadFile } from "../platform/download-file";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { groupedEan13Digits, LabelPreviewBars } from "./label-preview-bars";
import type { LabelPrinterChoice, LabelPrinterPort } from "./label-printer-port";
import type { LabelToPrint } from "./label-printer-print-sequence";
import {
  LABEL_PRINTER_SIZE_FIELDS,
  LABEL_PRINTER_SIZE_MESSAGES,
  labelPrinterSizeFormValues,
  labelPrinterSizeRequestFrom,
} from "./label-printer-size-form";
import {
  FIRST_LABEL_PRINTER_SIZE,
  readLabelPrinterSize,
  writeLabelPrinterSize,
} from "./label-printer-size-preference";
import type { PrintLabelsOutcome as PrinterOutcome } from "./print-labels-on-printer";
import { productDescription } from "./product-description";
import type { fetchPrinterLabels, PrintLabelEntry, printLabels } from "./products-api";

type LabelCounts = ReadonlyMap<string, number>;

const NO_LABELS: LabelCounts = new Map();

function countOf(counts: LabelCounts, productId: string): number {
  return counts.get(productId) ?? 0;
}

function withCount(counts: LabelCounts, productId: string, count: number): LabelCounts {
  return new Map(counts).set(productId, count);
}

function acceptsCounts(counts: LabelCounts): boolean {
  const entries = [...counts]
    .filter(([, count]) => count > 0)
    .map(([productId, count]) => ({ productId, count }));
  return labelSheetBodySchema.safeParse({ labels: entries }).success;
}

function withOneMore(counts: LabelCounts, productId: string): LabelCounts {
  return withCount(counts, productId, countOf(counts, productId) + 1);
}

type LabelableProduct = { product: ProductSummary; code: string; modules: string };

const BROWSER_WITHOUT_LABEL_PRINTER =
  "Este navegador no puede usar la impresora de etiquetas. Abrí el backoffice en Chrome o descargá la hoja A4.";

function printerNotice(
  outcome:
    | Exclude<LabelPrinterChoice, { kind: "chosen" }>
    | Exclude<PrinterOutcome, { kind: "printed" }>,
): PrintNotice {
  switch (outcome.kind) {
    case "unavailable":
      return { kind: "printerUnavailable" };
    case "no-printer":
      return { kind: "noPrinter" };
    case "chooser-failed":
      return { kind: "printerNotReached" };
    case "not-opened":
      return { kind: "printerNotOpened" };
    case "interrupted":
      return { kind: "printInterrupted", printed: outcome.printed, total: outcome.total };
  }
}

function labelableProducts(
  products: ProductSummary[],
  brands: readonly BrandSummary[],
): LabelableProduct[] {
  const labelable = products.flatMap((product) =>
    product.labelCode === null || product.labelModules === null
      ? []
      : [{ product, code: product.labelCode, modules: product.labelModules }],
  );
  return sortedItems(labelable, {
    order: textOrder((labelableProduct: LabelableProduct) =>
      productDescription(labelableProduct.product, brands),
    ),
    direction: "ascending",
  });
}

type PrintNotice =
  | { kind: "attemptFailed" }
  | { kind: "preparationFailed" }
  | { kind: "printerUnavailable" }
  | { kind: "noPrinter" }
  | { kind: "printerNotReached" }
  | { kind: "printerNotOpened" }
  | { kind: "printerFailed" }
  | { kind: "printInterrupted"; printed: number; total: number }
  | { kind: "productsChanged" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

export type PrintLabelsModalServices = {
  printLabels: typeof printLabels;
  fetchPrinterLabels: typeof fetchPrinterLabels;
  labelPrinterAvailable: () => boolean;
  chooseLabelPrinter: () => Promise<LabelPrinterChoice>;
  printOnLabelPrinter: (
    port: LabelPrinterPort,
    labels: readonly LabelToPrint[],
  ) => Promise<PrinterOutcome>;
};

type CloudRefusal = Exclude<Awaited<ReturnType<typeof printLabels>>, { kind: "ok" }>;

type PrintLabelsModalProps = {
  open: boolean;
  onClose: () => void;
  onSessionEnded: () => void;
  products: ProductSummary[];
  brands: BrandSummary[];
  onReload: () => Promise<void>;
  services: PrintLabelsModalServices;
};

export function PrintLabelsModal({
  open,
  onClose,
  onSessionEnded,
  products,
  brands,
  onReload,
  services,
}: PrintLabelsModalProps) {
  const {
    printLabels,
    fetchPrinterLabels,
    labelPrinterAvailable,
    chooseLabelPrinter,
    printOnLabelPrinter,
  } = services;
  const sendToMyAccount = useSendToMyAccount();
  const [counts, setCounts] = useState(NO_LABELS);
  const [notice, setNotice] = useState<PrintNotice | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printerPrinting, setPrinterPrinting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [openedWith, setOpenedWith] = useState(FIRST_LABEL_PRINTER_SIZE);
  const printRequestIdRef = useRef(0);
  const { form, submit, values, reset } = useRequestForm({
    defaultValues: labelPrinterSizeFormValues(FIRST_LABEL_PRINTER_SIZE),
    request: { schema: printerLabelSizeSchema, from: labelPrinterSizeRequestFrom },
    fields: LABEL_PRINTER_SIZE_FIELDS,
    messages: LABEL_PRINTER_SIZE_MESSAGES,
    onSubmit: async (_request, { parsed }) => {
      if (parsed) {
        await printOnPrinter(parsed);
      }
    },
  });

  useEffect(() => {
    printRequestIdRef.current += 1;
    if (open) {
      const size = readLabelPrinterSize();
      setOpenedWith(size);
      reset(labelPrinterSizeFormValues(size));
      setCounts(NO_LABELS);
      setNotice(null);
      setPrinting(false);
      setPrinterPrinting(false);
      setReloading(false);
    }
  }, [open, reset]);

  const rows = labelableProducts(products, brands);
  const total = rows.reduce((sum, row) => sum + countOf(counts, row.product.id), 0);
  const previewRow = rows.find((row) => countOf(counts, row.product.id) > 0) ?? rows[0];
  const busy = printing || reloading;
  const typedSize = printerLabelSizeSchema.safeParse(labelPrinterSizeRequestFrom(values));
  const previewSize = typedSize.success ? typedSize.data : openedWith;

  function changeCount(productId: string, delta: 1 | -1) {
    setCounts((current) => {
      if (delta === 1) {
        return acceptsCounts(withOneMore(current, productId))
          ? withOneMore(current, productId)
          : current;
      }
      return withCount(current, productId, Math.max(0, countOf(current, productId) - 1));
    });
  }

  const printerAvailable = labelPrinterAvailable();

  function chosenEntries(): PrintLabelEntry[] {
    return rows
      .map((row) => ({ productId: row.product.id, count: countOf(counts, row.product.id) }))
      .filter((entry) => entry.count > 0);
  }

  function showRefusal(outcome: CloudRefusal, failure: PrintNotice) {
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
    } else if (
      outcome.kind === "product_not_found" ||
      outcome.kind === "product_without_internal_barcode"
    ) {
      setNotice({ kind: "productsChanged" });
    } else {
      setNotice(failure);
    }
    setPrinting(false);
  }

  async function handleDownload() {
    const entries = chosenEntries();
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
      downloadFile(outcome.blob, "etiquetas.pdf");
      setPrinting(false);
      onClose();
      return;
    }
    showRefusal(outcome, { kind: "attemptFailed" });
  }

  async function printOnPrinter(size: PrinterLabelSize) {
    const entries = chosenEntries();
    if (entries.length === 0) {
      return;
    }
    setNotice(null);
    setPrinting(true);
    const requestId = printRequestIdRef.current;
    const choice = await chooseLabelPrinter();
    if (choice.kind !== "chosen") {
      setPrinting(false);
      setNotice(printerNotice(choice));
      return;
    }
    const prepared = await fetchPrinterLabels(entries, size);
    if (requestId !== printRequestIdRef.current) {
      return;
    }
    if (prepared.kind !== "ok") {
      showRefusal(prepared, { kind: "preparationFailed" });
      return;
    }
    setPrinterPrinting(true);
    const outcome = await printOnLabelPrinter(choice.port, prepared.labels).catch(() => null);
    setPrinterPrinting(false);
    setPrinting(false);
    if (outcome === null) {
      setNotice({ kind: "printerFailed" });
      return;
    }
    if (outcome.kind === "printed") {
      writeLabelPrinterSize(size);
      onClose();
      return;
    }
    setNotice(printerNotice(outcome));
  }

  async function handleReload() {
    setReloading(true);
    const requestId = printRequestIdRef.current;
    await onReload();
    if (requestId !== printRequestIdRef.current) {
      return;
    }
    setCounts(NO_LABELS);
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
      width="wide"
      tone="info"
      icon={<Printer />}
      context="Catálogo · Productos"
      title="Imprimir etiquetas"
      closable={!printerPrinting}
      footer={
        <>
          <Button variant="secondary" size="large" icon={<X />} disabled={busy} onPress={onClose}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            size="large"
            icon={<Download />}
            disabled={busy || total === 0}
            onPress={() => void handleDownload()}
          >
            Descargar la hoja A4
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Printer />}
            fullWidth
            disabled={busy || total === 0}
            {...(printerAvailable ? {} : { disabledReason: BROWSER_WITHOUT_LABEL_PRINTER })}
            onPress={() => void submit()}
          >
            Imprimir en la impresora de etiquetas
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "printerUnavailable" && (
          <InlineNotice
            tone="warning"
            icon={<Printer />}
            title="Este navegador no puede usar la impresora de etiquetas"
            description="Abrí el backoffice en Chrome o descargá la hoja A4."
          />
        )}
        {notice?.kind === "attemptFailed" && (
          <ActionFailureNotice title="No se pudo generar la hoja" />
        )}
        {notice?.kind === "preparationFailed" && (
          <ActionFailureNotice title="No se pudo preparar la impresión" />
        )}
        {notice?.kind === "noPrinter" && (
          <InlineNotice
            tone="warning"
            icon={<Printer />}
            title="No se eligió ninguna impresora"
            description="Conectá la impresora de etiquetas por USB y volvé a intentar."
          />
        )}
        {notice?.kind === "printerNotReached" && (
          <InlineNotice
            tone="error"
            icon={<Printer />}
            title="No se pudo conectar con la impresora"
            description="Probá de nuevo."
          />
        )}
        {notice?.kind === "printerNotOpened" && (
          <InlineNotice
            tone="error"
            icon={<Printer />}
            title="No se pudo conectar con la impresora"
            description="Cerrá otros programas que la estén usando y volvé a intentar."
          />
        )}
        {notice?.kind === "printerFailed" && (
          <ActionFailureNotice title="No se pudo imprimir en la impresora de etiquetas" />
        )}
        {notice?.kind === "printInterrupted" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="La impresión se interrumpió"
            description={`Se imprimieron ${formatNumber(notice.printed)} de ${plural(notice.total, {
              one: "1 etiqueta",
              other: `${formatNumber(notice.total)} etiquetas`,
            })}.`}
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
                const count = countOf(counts, product.id);
                return (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-surface-subtle px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-body font-bold text-text">
                        {productDescription(product, brands)}
                      </span>
                      <span className="truncate font-mono text-detail text-text-subtle">
                        {code}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <IconButton
                        icon={<Minus />}
                        aria-label={`Restar una etiqueta de ${productDescription(product, brands)}`}
                        disabled={count === 0}
                        onPress={() => changeCount(product.id, -1)}
                      />
                      <span className="w-8 text-center font-mono text-body text-text">{count}</span>
                      <IconButton
                        icon={<Plus />}
                        aria-label={`Sumar una etiqueta a ${productDescription(product, brands)}`}
                        disabled={!acceptsCounts(withOneMore(counts, product.id))}
                        onPress={() => changeCount(product.id, 1)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <form.AppField name="widthMm">
                {(field) => <field.TextField kind="plain-text" label="Ancho" suffix="mm" />}
              </form.AppField>
              <form.AppField name="heightMm">
                {(field) => <field.TextField kind="plain-text" label="Alto" suffix="mm" />}
              </form.AppField>
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
                    {productDescription(previewRow.product, brands)}
                  </span>
                  <LabelPreviewBars modules={previewRow.modules} />
                  <span className="font-mono text-caption text-text">
                    {groupedEan13Digits(previewRow.code)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-heading text-text-accent">
                    {plural(total, {
                      one: "1 etiqueta",
                      other: `${formatNumber(total)} etiquetas`,
                    })}
                  </p>
                  <p className="text-detail text-text-subtle">
                    Etiquetas de {formatNumber(previewSize.widthMm)} ×{" "}
                    {formatNumber(previewSize.heightMm)} mm en la impresora de etiquetas, o una hoja
                    A4 para cualquier impresora común.
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
