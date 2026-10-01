import type { ProductSummary } from "@purosur/contracts";
import { LABELS_MAX_COUNT_PER_PRODUCT, LABELS_MAX_TOTAL_COUNT } from "@purosur/domain";
import {
  Button,
  EmptyState,
  IconButton,
  InlineNotice,
  Modal,
  plural,
  sortedItems,
  textOrder,
} from "@purosur/ui";
import { Download, Minus, Package, Plus, Printer, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { groupedEan13Digits, LabelPreviewBars } from "./label-preview-bars";
import type { printLabels } from "./products-api";

type LabelableProduct = { product: ProductSummary; code: string };

function labelableProducts(products: ProductSummary[]): LabelableProduct[] {
  const labelable = products.flatMap((product) =>
    product.labelCode === null ? [] : [{ product, code: product.labelCode }],
  );
  return sortedItems(labelable, {
    order: textOrder((labelableProduct) => labelableProduct.product.name),
    direction: "ascending",
  });
}

// Long enough for any browser to finish handing the blob to its download before it's released.
const DOWNLOAD_URL_LIFETIME_MS = 60_000;

type PrintNotice =
  | { kind: "attemptFailed" }
  | { kind: "productsChanged" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

export type PrintLabelsModalServices = {
  printLabels: typeof printLabels;
};

type PrintLabelsModalProps = {
  open: boolean;
  onClose: () => void;
  onSessionEnded: () => void;
  products: ProductSummary[];
  onReload: () => Promise<void>;
  services: PrintLabelsModalServices;
};

export function PrintLabelsModal({
  open,
  onClose,
  onSessionEnded,
  products,
  onReload,
  services,
}: PrintLabelsModalProps) {
  const { printLabels } = services;
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

  const rows = labelableProducts(products);
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
