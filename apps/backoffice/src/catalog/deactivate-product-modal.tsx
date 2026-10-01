import type { ProductSummary } from "@purosur/contracts";
import { Button, InlineNotice, Modal } from "@purosur/ui";
import { Ban, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type { deactivateProduct } from "./products-api";

export type DeactivateProductModalServices = {
  deactivateProduct: typeof deactivateProduct;
};

type DeactivateProductModalProps = {
  target: ProductSummary | null;
  onClose: () => void;
  onDeactivated: () => void;
  onVanished: () => void;
  onSessionEnded: () => void;
  services: DeactivateProductModalServices;
};

type DeactivateNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "alreadyInactive" };

export function DeactivateProductModal({
  target,
  onClose,
  onDeactivated,
  onVanished,
  onSessionEnded,
  services,
}: DeactivateProductModalProps) {
  const { deactivateProduct } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<DeactivateNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && target) {
      setTitle(`¿Desactivar ${target.name}?`);
      setNotice(null);
      setSubmitting(false);
    }
  }, [open, target]);

  async function handleConfirm() {
    if (!target) {
      return;
    }
    setNotice(null);
    setSubmitting(true);

    const outcome = await deactivateProduct(target.id);
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
