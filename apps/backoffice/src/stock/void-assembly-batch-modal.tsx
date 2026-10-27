import type { AssemblyBatch } from "@purosur/contracts";
import { Button, InlineNotice, Modal } from "@purosur/ui";
import { Ban, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
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

type VoidNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "outdated"; message: string };

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
    setNotice({ kind: "outdated", message: outcome.message });
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
      title={`¿Anular la tanda de ${batch.productName}?`}
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
              Anular tanda
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">
          {`Los componentes vuelven al stock, se descuentan ${formatStockQuantity(batch.output, batch.saleUnit)} de ${batch.productName} y el lote de la tanda queda en cero.`}
        </p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se anuló la tanda"
            description="Volvé a intentarlo."
          />
        )}
        {notice?.kind === "outdated" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice.message} />
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
