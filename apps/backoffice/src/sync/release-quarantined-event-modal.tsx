import { Button, InlineNotice, Modal } from "@purosur/ui";
import { LockOpen, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { quarantinedEventSentenceText } from "./quarantined-event-labels";
import { type QuarantinedEvent, releaseQuarantinedEvent } from "./quarantined-events-api";

export type ReleaseQuarantinedEventModalServices = {
  releaseQuarantinedEvent: typeof releaseQuarantinedEvent;
};

const defaultServices: ReleaseQuarantinedEventModalServices = { releaseQuarantinedEvent };

type ReleaseQuarantinedEventModalProps = {
  target: QuarantinedEvent | null;
  onClose: () => void;
  onReleased: () => void;
  onOutdated: (reason: "not_quarantined" | "not_found") => void;
  onSessionEnded: () => void;
  services?: ReleaseQuarantinedEventModalServices;
};

type ReleaseNotice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

export function ReleaseQuarantinedEventModal({
  target,
  onClose,
  onReleased,
  onOutdated,
  onSessionEnded,
  services = defaultServices,
}: ReleaseQuarantinedEventModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [shown, setShown] = useState<QuarantinedEvent | null>(null);
  const [notice, setNotice] = useState<ReleaseNotice | null>(null);
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
    const outcome = await services.releaseQuarantinedEvent(target.eventId);
    if (outcome.kind === "ok") {
      onReleased();
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
    if (outcome.kind === "not_quarantined" || outcome.kind === "not_found") {
      onOutdated(outcome.kind);
      return;
    }
    setSubmitting(false);
    setNotice(
      outcome.kind === "rate_limited"
        ? { kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds }
        : { kind: "attemptFailed" },
    );
  }

  return (
    <Modal
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="confirmation"
      tone="info"
      icon={<LockOpen />}
      title="¿Liberar este evento?"
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
          <Button
            variant="primary"
            size="large"
            icon={<LockOpen />}
            fullWidth
            disabled={submitting}
            onPress={() => void handleConfirm()}
          >
            Liberar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {shown ? (
          <p className="text-body text-text">
            {`La nube va a volver a intentar aplicar este ${quarantinedEventSentenceText(shown.eventType)} de la caja ${shown.registerName}. El evento no se modifica. Si vuelve a fallar en todos los intentos, queda otra vez en cuarentena y se abre una alerta nueva.`}
          </p>
        ) : null}
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No pudimos liberar el evento"
            description="Probá de nuevo."
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
