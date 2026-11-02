import type { PurchaseOrderDetail } from "@purosur/contracts";
import { Button, InlineNotice, LoadFailure, LoadingPlaceholder, Modal } from "@purosur/ui";
import { Check, Copy, Download, RotateCcw, Send, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { downloadFile } from "../platform/download-file";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  fetchPurchaseOrderPdf,
  fetchPurchaseOrderText,
  sharePurchaseOrder,
} from "./purchase-orders-api";
import { usePurchaseOrderTextQuery } from "./purchasing-queries";

export type SharePurchaseOrderModalServices = {
  fetchPurchaseOrderText: typeof fetchPurchaseOrderText;
  fetchPurchaseOrderPdf: typeof fetchPurchaseOrderPdf;
  sharePurchaseOrder: typeof sharePurchaseOrder;
};

type SharePurchaseOrderModalProps = {
  target: PurchaseOrderDetail | null;
  services: SharePurchaseOrderModalServices;
  onShared: (order: PurchaseOrderDetail) => void;
  onOutdated: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

type Notice =
  | { kind: "copied" }
  | { kind: "copyFailed" }
  | { kind: "pdfFailed" }
  | { kind: "shareFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "notShareable" }
  | { kind: "notFound" };

const PDF_FILE_NAME = "pedido.pdf";

export function SharePurchaseOrderModal({
  target,
  services,
  onShared,
  onOutdated,
  onClose,
  onSessionEnded,
}: SharePurchaseOrderModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const text = usePurchaseOrderTextQuery({
    orderId: target?.id ?? null,
    fetchPurchaseOrderText: services.fetchPurchaseOrderText,
    onSessionEnded,
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setNotice(null);
      setBusy(false);
    }
  }, [target]);

  const read = text.status === "loaded" ? text.value : null;
  const orderText = read?.kind === "found" ? read.text : null;
  const outdated =
    notice?.kind === "notShareable" || notice?.kind === "notFound" || read?.kind === "not_found";

  async function handleCopy() {
    if (orderText === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(orderText);
      setNotice({ kind: "copied" });
    } catch {
      setNotice({ kind: "copyFailed" });
    }
  }

  function refuse(outcome: { kind: string; retryAfterSeconds?: number }, failure: Notice) {
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds ?? 0 });
    } else if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
    } else if (outcome.kind === "not_shareable") {
      setNotice({ kind: "notShareable" });
    } else {
      setNotice(failure);
    }
  }

  async function handleDownload() {
    if (!target) {
      return;
    }
    setNotice(null);
    setBusy(true);
    const outcome = await services.fetchPurchaseOrderPdf(target.id);
    if (outcome.kind === "ok") {
      downloadFile(outcome.blob, PDF_FILE_NAME);
      setBusy(false);
      return;
    }
    refuse(outcome, { kind: "pdfFailed" });
    setBusy(false);
  }

  async function handleShare() {
    if (!target) {
      return;
    }
    setNotice(null);
    setBusy(true);
    const outcome = await services.sharePurchaseOrder(target.id);
    if (outcome.kind === "ok") {
      onShared(outcome.order);
      return;
    }
    refuse(outcome, { kind: "shareFailed" });
    setBusy(false);
  }

  return (
    <Modal
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Send />}
      context="Compras · Pedidos"
      title="Compartir pedido"
      closable
      footer={
        <>
          <Button variant="secondary" size="large" icon={<X />} disabled={busy} onPress={onClose}>
            Cerrar
          </Button>
          {outdated ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              onPress={onOutdated}
            >
              Actualizar el pedido
            </Button>
          ) : target?.shareable ? (
            <Button
              variant="primary"
              size="large"
              icon={<Send />}
              fullWidth
              disabled={busy}
              onPress={() => void handleShare()}
            >
              Marcar como enviado
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">
          Enviáselo al proveedor por el canal que uses (WhatsApp, correo…). El sistema no lo envía.
        </p>
        {text.status === "loading" && <LoadingPlaceholder variant="card" lines={3} />}
        {text.status === "failed" && (
          <LoadFailure {...cloudLoadFailure(text, "el texto del pedido")} />
        )}
        {orderText !== null && (
          <pre className="whitespace-pre-wrap rounded-lg bg-surface-subtle p-3 font-mono text-detail text-text">
            {orderText}
          </pre>
        )}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            icon={<Copy />}
            disabled={orderText === null}
            onPress={() => void handleCopy()}
          >
            Copiar texto
          </Button>
          <Button
            variant="secondary"
            icon={<Download />}
            disabled={busy}
            onPress={() => void handleDownload()}
          >
            Descargar PDF
          </Button>
        </div>
        {notice?.kind === "copied" && (
          <InlineNotice tone="success" icon={<Check />} title="Texto copiado" />
        )}
        {notice?.kind === "copyFailed" && (
          <ActionFailureNotice
            title="No se pudo copiar el texto"
            description="Seleccionalo y copialo a mano."
          />
        )}
        {notice?.kind === "pdfFailed" && <ActionFailureNotice title="No se pudo generar el PDF" />}
        {notice?.kind === "shareFailed" && (
          <ActionFailureNotice
            title="No se marcó el pedido como enviado"
            description="Volvé a intentarlo."
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
        {notice?.kind === "notShareable" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Este pedido ya no se puede marcar como enviado"
            description="Actualizá el pedido para ver su estado actual."
          />
        )}
        {(notice?.kind === "notFound" || read?.kind === "not_found") && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Este pedido ya no existe"
            description="Volvé a la lista de pedidos."
          />
        )}
      </div>
    </Modal>
  );
}
