import type { PendingRefundsBody } from "@purosur/contracts";
import { Button, formatCents, InlineNotice, Modal } from "@purosur/ui";
import { CircleCheck, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { refundMethodLabel } from "./refund-method-label";
import type { markRefundDone } from "./refunds-api";

export type MarkRefundDoneModalServices = {
  markRefundDone: typeof markRefundDone;
};

type PendingRefund = PendingRefundsBody["refunds"][number];

type MarkRefundDoneModalProps = {
  target: PendingRefund | null;
  onClose: () => void;
  onDone: () => void;
  onSessionEnded: () => void;
  services: MarkRefundDoneModalServices;
};

type MarkDoneNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "alreadyDone" }
  | { kind: "notFound" };

export function MarkRefundDoneModal({
  target,
  onClose,
  onDone,
  onSessionEnded,
  services,
}: MarkRefundDoneModalProps) {
  const { markRefundDone } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState<PendingRefund | null>(null);
  const [notice, setNotice] = useState<MarkDoneNotice | null>(null);
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
    const outcome = await markRefundDone(target.id);
    if (outcome.kind === "ok") {
      onDone();
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
    if (outcome.kind === "already_done") {
      setNotice({ kind: "alreadyDone" });
      return;
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    setNotice({ kind: "attemptFailed" });
  }

  const listOutdated = notice?.kind === "alreadyDone" || notice?.kind === "notFound";

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
      icon={<CircleCheck />}
      title={shown ? `¿Marcar como hecho el reembolso de ${formatCents(shown.amount)}?` : ""}
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
              onPress={onDone}
            >
              Actualizar la lista
            </Button>
          ) : (
            <Button
              variant="primary"
              size="large"
              icon={<CircleCheck />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Marcar como hecho
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {shown ? (
          <p className="text-body text-text">
            Confirmá que ya se lo devolviste al cliente por{" "}
            {refundMethodLabel(shown.method).toLowerCase()}.
          </p>
        ) : null}
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se marcó el reembolso como hecho"
            description="Volvé a intentarlo."
          />
        )}
        {notice?.kind === "alreadyDone" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Ya estaba marcado como hecho"
          />
        )}
        {notice?.kind === "notFound" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title="Este reembolso ya no existe" />
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
