import type { PendingRefundsBody } from "@purosur/contracts";
import { Button, formatCents, InlineNotice, Modal } from "@purosur/ui";
import { CircleX, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type { discardRefund } from "./refunds-api";

export type DiscardRefundModalServices = {
  discardRefund: typeof discardRefund;
};

type PendingRefund = PendingRefundsBody["refunds"][number];

type DiscardRefundModalProps = {
  target: PendingRefund | null;
  onClose: () => void;
  onDone: () => void;
  onSessionEnded: () => void;
  services: DiscardRefundModalServices;
};

type DiscardNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "alreadyDone" }
  | { kind: "alreadyDiscarded" }
  | { kind: "alreadyConfirmed" }
  | { kind: "notDiscardable" }
  | { kind: "notFound" };

export function DiscardRefundModal({
  target,
  onClose,
  onDone,
  onSessionEnded,
  services,
}: DiscardRefundModalProps) {
  const { discardRefund } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState<PendingRefund | null>(null);
  const [notice, setNotice] = useState<DiscardNotice | null>(null);
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
    const outcome = await discardRefund(target.id);
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
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    if (outcome.kind === "failed") {
      setNotice({ kind: "attemptFailed" });
      return;
    }
    setNotice({ kind: STALE_NOTICE_KINDS[outcome.kind] });
  }

  const listOutdated =
    notice !== null && notice.kind !== "attemptFailed" && notice.kind !== "rateLimited";

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
      icon={<CircleX />}
      title={shown ? `¿Descartar el reembolso de ${formatCents(shown.amount)}?` : ""}
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
              icon={<CircleX />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Descartar reembolso
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {shown ? (
          <p className="text-body text-text">
            Se cierra la tarea sin devolver el dinero al cliente y se resuelve su alerta. Descartala
            solo si no corresponde reembolsar este pago.
          </p>
        ) : null}
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se descartó el reembolso"
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
        {notice?.kind === "alreadyDiscarded" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title="Ya estaba descartado" />
        )}
        {notice?.kind === "alreadyConfirmed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Ese reembolso ya se confirmó y se envía a Mercado Pago; ya no se puede descartar."
          />
        )}
        {notice?.kind === "notDiscardable" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Este reembolso no se puede descartar"
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

const STALE_NOTICE_KINDS = {
  already_done: "alreadyDone",
  already_discarded: "alreadyDiscarded",
  already_confirmed: "alreadyConfirmed",
  not_discardable: "notDiscardable",
  not_found: "notFound",
} as const;
