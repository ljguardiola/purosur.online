import type { PurchaseSummary } from "@purosur/contracts";
import { Button, Modal } from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  type PurchaseCorrectionNotice,
  PurchaseCorrectionNotices,
} from "./purchase-correction-notices";
import { costPaidOf, quantityOf } from "./purchase-line-text";
import type { removePurchaseLine } from "./purchases-api";

export type RemovePurchaseLineModalServices = {
  removePurchaseLine: typeof removePurchaseLine;
};

export type PurchaseLineRemovalTarget = {
  purchase: PurchaseSummary;
  line: PurchaseSummary["lines"][number];
};

type RemovePurchaseLineModalProps = {
  target: PurchaseLineRemovalTarget | null;
  services: RemovePurchaseLineModalServices;
  onRemoved: (purchase: PurchaseSummary) => void;
  onStale: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function RemovePurchaseLineModal({
  target,
  services,
  onRemoved,
  onStale,
  onClose,
  onSessionEnded,
}: RemovePurchaseLineModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState<PurchaseLineRemovalTarget | null>(null);
  const [notice, setNotice] = useState<PurchaseCorrectionNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target) {
      setShown(target);
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
    const outcome = await services.removePurchaseLine(target.purchase.id, target.line.id);
    if (outcome.kind === "ok") {
      onRemoved(outcome.purchase);
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
    switch (outcome.kind) {
      case "units_left_lot":
        setNotice({ kind: "unitsLeftTheLineLot" });
        onStale();
        return;
      case "counted_since_receipt":
        setNotice({ kind: "countedSinceReceipt" });
        onStale();
        return;
      case "last_line":
        setNotice({ kind: "lastLine" });
        onStale();
        return;
      case "not_found":
        setNotice({ kind: "notFound" });
        return;
      case "rate_limited":
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      case "failed":
        setNotice({ kind: "attemptFailed" });
        return;
    }
  }

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
      title={shown ? `¿Quitar "${formatProductDescription(shown.line.product)}" de la compra?` : ""}
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
          <Button
            variant="primary"
            destructive
            size="large"
            icon={<Trash2 />}
            fullWidth
            disabled={submitting}
            onPress={() => void handleConfirm()}
          >
            Quitar el producto
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {shown ? (
          <p className="text-body text-text">
            {`Salen del stock ${quantityOf(shown.line)} con un costo pagado de ${costPaidOf(shown.line)}.`}
          </p>
        ) : null}
        <PurchaseCorrectionNotices notice={notice} failedTitle="No se quitó el producto" />
      </div>
    </Modal>
  );
}
