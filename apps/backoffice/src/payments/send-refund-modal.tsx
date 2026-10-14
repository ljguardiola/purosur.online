import type { ConfirmedRefundBody, PendingRefundsBody } from "@purosur/contracts";
import { Button, formatCents, InlineNotice, Modal } from "@purosur/ui";
import { RotateCcw, Send, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { paymentMethodLabel } from "../platform/payment-method-label";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { refundReason } from "./refund-reason";
import type { confirmRefund } from "./refunds-api";

export type SendRefundModalServices = {
  confirmRefund: typeof confirmRefund;
};

type PendingRefund = PendingRefundsBody["refunds"][number];

type SendRefundModalProps = {
  target: PendingRefund | null;
  onClose: () => void;
  onConfirmed: (body: ConfirmedRefundBody) => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
  services: SendRefundModalServices;
};

type SendNotice =
  | { kind: "attemptFailed" }
  | { kind: "notConfigured" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "outdated"; title: string };

const OUTDATED_TITLES = {
  not_found: "Este reembolso ya no existe",
  not_confirmable: "Este reembolso no se puede enviar a Mercado Pago",
  already_done: "Este reembolso ya estaba hecho",
  already_confirmed: "Este reembolso ya estaba confirmado",
  not_backed: "No consta la cancelación que justifica este reembolso",
  exceeds_refundable: "El reembolso es mayor a lo que queda por devolver del pago",
} as const;

export function SendRefundModal({
  target,
  onClose,
  onConfirmed,
  onOutdated,
  onSessionEnded,
  services,
}: SendRefundModalProps) {
  const { confirmRefund } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState<PendingRefund | null>(null);
  const [notice, setNotice] = useState<SendNotice | null>(null);
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
    const outcome = await confirmRefund(target.id);
    if (outcome.kind === "ok") {
      onConfirmed(outcome.value);
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
    if (outcome.kind === "not_configured") {
      setNotice({ kind: "notConfigured" });
      return;
    }
    if (outcome.kind === "failed") {
      setNotice({ kind: "attemptFailed" });
      return;
    }
    setNotice({ kind: "outdated", title: OUTDATED_TITLES[outcome.kind] });
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
      tone="info"
      icon={<Send />}
      title="¿Enviar el reembolso a Mercado Pago?"
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
          {notice?.kind === "outdated" ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              disabled={submitting}
              onPress={onOutdated}
            >
              Actualizar la lista
            </Button>
          ) : (
            <Button
              variant="primary"
              size="large"
              icon={<Send />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Enviar a Mercado Pago
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {shown ? (
          <div className="flex flex-col gap-2">
            <p className="text-body text-text">
              Se devuelven {formatCents(shown.amount)} al cliente por{" "}
              {paymentMethodLabel(shown.method)}.
            </p>
            <p className="text-body text-text-subtle">{refundReason(shown).detail}</p>
          </div>
        ) : null}
        <p className="text-body text-text">
          Mercado Pago devuelve el pago al cliente. Si la cuenta no tiene saldo suficiente, queda
          pendiente y se reintenta.
        </p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se envió el reembolso"
            description="Volvé a intentarlo."
          />
        )}
        {notice?.kind === "notConfigured" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Mercado Pago no está configurado"
          />
        )}
        {notice?.kind === "outdated" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice.title} />
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
