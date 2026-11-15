import { Button, InlineNotice, Modal } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { MailX, ShieldX, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { useAuthorization } from "../platform/authorization-modal";
import type { BranchUser } from "../platform/branch-users-api";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToOwnAccount } from "../platform/send-to-own-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type {
  WithdrawUserAlertEmailOptInOutcome,
  withdrawUserAlertEmailOptIn,
} from "./alert-email-opt-in-api";

export type WithdrawUserAlertEmailOptInModalServices = {
  withdrawUserAlertEmailOptIn: typeof withdrawUserAlertEmailOptIn;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type WithdrawUserAlertEmailOptInModalProps = {
  open: boolean;
  user: BranchUser;
  onClose: () => void;
  onWithdrawn: () => void;
  onVanished: () => void;
  onSessionEnded: () => void;
  services: WithdrawUserAlertEmailOptInModalServices;
};

export function WithdrawUserAlertEmailOptInModal({
  open,
  user,
  onClose,
  onWithdrawn,
  onVanished,
  onSessionEnded,
  services,
}: WithdrawUserAlertEmailOptInModalProps) {
  const {
    withdrawUserAlertEmailOptIn,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const sendToOwnAccount = useSendToOwnAccount();
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<WithdrawUserAlertEmailOptInOutcome>({
    actionName: "Dejar de recibir alertas por email",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (open) {
      setAttemptFailed(false);
      setRateLimitedSeconds(null);
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    setAttemptFailed(false);
    setRateLimitedSeconds(null);
    setSubmitting(true);

    const outcome = await run(() => withdrawUserAlertEmailOptIn(user.id));
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "ok") {
      onWithdrawn();
      return;
    }
    if (outcome.kind === "not_found") {
      onVanished();
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToOwnAccount();
      return;
    }
    if (outcome.kind === "rate_limited") {
      setRateLimitedSeconds(outcome.retryAfterSeconds);
      setSubmitting(false);
      return;
    }
    setAttemptFailed(true);
    setSubmitting(false);
  }

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="confirmation"
        tone="error"
        icon={<MailX />}
        title={`¿Dejar de enviar alertas por email a ${user.firstName}?`}
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
              destructive
              size="large"
              icon={<MailX />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Dejar de recibir alertas por email
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-body text-text">
            {`${user.firstName} deja de recibir alertas por email. Su usuario sigue activo y su historial queda igual.`}
          </p>
          {attemptFailed ? (
            <ActionFailureNotice
              title={`No se pudo hacer que ${user.firstName} deje de recibir alertas por email`}
            />
          ) : null}
          {rateLimitedSeconds !== null && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(rateLimitedSeconds)}
            />
          )}
        </div>
      </Modal>
      {modal}
    </>
  );
}
