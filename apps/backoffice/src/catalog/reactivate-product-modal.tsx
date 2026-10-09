import type { ProductSummary } from "@purosur/contracts";
import { Button, InlineNotice, Modal } from "@purosur/ui";
import { RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { barcodeTakenError } from "./product-form";
import type { reactivateProduct } from "./products-api";

export type ReactivateProductModalServices = {
  reactivateProduct: typeof reactivateProduct;
};

type ReactivateProductModalProps = {
  target: ProductSummary | null;
  onClose: () => void;
  onReactivated: () => void;
  onSessionEnded: () => void;
  services: ReactivateProductModalServices;
};

type ReactivateNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "barcodeTaken"; codes: string[] }
  | { kind: "alreadyChanged" }
  | { kind: "notFound" };

export function ReactivateProductModal({
  target,
  onClose,
  onReactivated,
  onSessionEnded,
  services,
}: ReactivateProductModalProps) {
  const { reactivateProduct } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<ReactivateNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && target) {
      setTitle(`¿Reactivar ${target.name}?`);
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
    const outcome = await reactivateProduct(target.id);
    if (outcome.kind === "ok") {
      onReactivated();
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
    if (outcome.kind === "already_changed") {
      setNotice({ kind: "alreadyChanged" });
      return;
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
      return;
    }
    if (outcome.kind === "barcode_taken") {
      setNotice({ kind: "barcodeTaken", codes: outcome.codes });
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    setNotice({ kind: "attemptFailed" });
  }

  const listOutdated = notice?.kind === "alreadyChanged" || notice?.kind === "notFound";

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="confirmation"
      tone="info"
      icon={<RotateCcw />}
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
          {listOutdated ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              disabled={submitting}
              onPress={onReactivated}
            >
              Actualizar la lista
            </Button>
          ) : (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Reactivar
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">Vuelve a venderse en el catálogo y en las cajas.</p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se reactivó el producto"
            description="Volvé a intentarlo."
          />
        )}
        {notice?.kind === "barcodeTaken" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se puede reactivar"
            description={`${barcodeTakenError(notice.codes)} Cambiá ese código en este producto o desactivá el otro, y volvé a intentarlo.`}
          />
        )}
        {notice?.kind === "alreadyChanged" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title="Ya estaba activo" />
        )}
        {notice?.kind === "notFound" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title="Este producto ya no existe" />
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
