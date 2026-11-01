import type { PurchaseOrderDetail } from "@purosur/contracts";
import { Button, InlineNotice, Modal } from "@purosur/ui";
import { RotateCcw, ShieldX, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type { cancelPurchaseOrder } from "./purchase-orders-api";

export type CancelPurchaseOrderModalServices = {
  cancelPurchaseOrder: typeof cancelPurchaseOrder;
};

type CancelPurchaseOrderModalProps = {
  target: PurchaseOrderDetail | null;
  services: CancelPurchaseOrderModalServices;
  onCancelled: (order: PurchaseOrderDetail) => void;
  onOutdated: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

type Notice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "notCancellable" }
  | { kind: "notFound" };

export function CancelPurchaseOrderModal({
  target,
  services,
  onCancelled,
  onOutdated,
  onClose,
  onSessionEnded,
}: CancelPurchaseOrderModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target) {
      setTitle(`¿Cancelar el pedido a ${target.supplier.name}?`);
      setNotice(null);
      setSubmitting(false);
    }
  }, [target]);

  async function handleConfirm() {
    if (!target) {
      return;
    }
    setNotice(null);
    setSubmitting(true);
    const outcome = await services.cancelPurchaseOrder(target.id);
    if (outcome.kind === "ok") {
      onCancelled(outcome.order);
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
    setSubmitting(false);
    if (outcome.kind === "not_cancellable") {
      setNotice({ kind: "notCancellable" });
    } else if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setNotice({ kind: "attemptFailed" });
    }
  }

  const outdated = notice?.kind === "notCancellable" || notice?.kind === "notFound";

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
      icon={<Trash2 />}
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
            Volver
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
          ) : (
            <Button
              variant="primary"
              destructive
              size="large"
              icon={<Trash2 />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Cancelar pedido
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">El pedido queda cancelado y ya no se puede editar.</p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se canceló el pedido"
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
        {notice?.kind === "notCancellable" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Este pedido ya no se puede cancelar"
            description="Actualizá el pedido para ver su estado actual."
          />
        )}
        {notice?.kind === "notFound" && (
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
