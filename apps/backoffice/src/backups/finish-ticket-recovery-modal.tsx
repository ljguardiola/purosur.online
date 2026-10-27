import { Button, InlineNotice, Modal } from "@purosur/ui";
import { CircleCheck, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  ContingencyTicketRecovery,
  finishContingencyTicketRecovery,
} from "./contingency-ticket-recovery-api";

export type FinishTicketRecoveryModalServices = {
  finishContingencyTicketRecovery: typeof finishContingencyTicketRecovery;
};

export type FinishedRecoveryOutcome = "finished" | "already_finished" | "not_found";

type FinishTicketRecoveryModalProps = {
  target: Pick<ContingencyTicketRecovery, "recovery_id" | "register_name"> | null;
  onClose: () => void;
  onFinished: (outcome: FinishedRecoveryOutcome) => void;
  onSessionEnded: () => void;
  services: FinishTicketRecoveryModalServices;
};

type FinishNotice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

export function FinishTicketRecoveryModal({
  target,
  onClose,
  onFinished,
  onSessionEnded,
  services,
}: FinishTicketRecoveryModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [shown, setShown] = useState(target);
  const [notice, setNotice] = useState<FinishNotice | null>(null);
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
    const outcome = await services.finishContingencyTicketRecovery(target.recovery_id);
    if (outcome.kind === "ok") {
      onFinished(outcome.value.outcome);
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
      icon={<CircleCheck />}
      title={shown ? `¿Terminar el rescate de ${shown.register_name}?` : ""}
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
            size="large"
            icon={<CircleCheck />}
            fullWidth
            disabled={submitting}
            onPress={() => void handleConfirm()}
          >
            Terminar el rescate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">
          Los tickets que se escaneen después no van a llegar a la caja restaurada.
        </p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo terminar el rescate"
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
