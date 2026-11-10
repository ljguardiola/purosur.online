import type { AssemblyBatch, AssemblyBatchVoidRefusal } from "@purosur/contracts";
import { Button, InlineNotice, Modal } from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { Ban, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { formatStockQuantity } from "../platform/stock-quantity";
import type { voidAssemblyBatch } from "./assembly-batches-api";

export type VoidAssemblyBatchModalServices = {
  voidAssemblyBatch: typeof voidAssemblyBatch;
};

type VoidAssemblyBatchModalProps = {
  batch: AssemblyBatch;
  onVoided: () => void;
  onOutdated: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
  services: VoidAssemblyBatchModalServices;
};

type VoidRefusal = AssemblyBatchVoidRefusal["code"];

const VOID_REFUSAL_TEXTS: Record<VoidRefusal, string> = {
  not_found: "No se encontró la producción.",
  already_voided: "La producción ya fue anulada.",
  consumed: "La producción ya tuvo consumo: corregila con un ajuste y un recuento.",
};

type VoidNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "outdated"; refusal: VoidRefusal };

export function VoidAssemblyBatchModal({
  batch,
  onVoided,
  onOutdated,
  onClose,
  onSessionEnded,
  services,
}: VoidAssemblyBatchModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<VoidNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const product = formatProductDescription({
    name: batch.productName,
    brandName: batch.brandName,
    netContent: batch.netContent,
  });

  async function handleConfirm() {
    setNotice(null);
    setSubmitting(true);
    const outcome = await services.voidAssemblyBatch(batch.id);
    if (outcome.kind === "ok") {
      onVoided();
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
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    if (outcome.kind === "failed") {
      setNotice({ kind: "attemptFailed" });
      return;
    }
    setNotice({ kind: "outdated", refusal: outcome.kind });
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="confirmation"
      tone="info"
      icon={<Ban />}
      title={`¿Anular la producción de ${product}?`}
      closable={!submitting}
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
          {notice?.kind === "outdated" ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              onPress={onOutdated}
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
              Anular producción
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">
          {`Los componentes vuelven al stock, se descuentan ${formatStockQuantity(batch.output, batch.saleUnit)} de ${product} y el lote de la producción queda en cero.`}
        </p>
        {notice?.kind === "attemptFailed" && (
          <ActionFailureNotice
            title="No se anuló la producción"
            description="Volvé a intentarlo."
          />
        )}
        {notice?.kind === "outdated" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={VOID_REFUSAL_TEXTS[notice.refusal]}
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
      </div>
    </Modal>
  );
}
