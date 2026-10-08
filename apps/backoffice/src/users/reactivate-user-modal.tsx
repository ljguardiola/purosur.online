import { Button, InlineNotice, Modal } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { BranchUser, ReactivateUserOutcome, reactivateUser } from "./users-api";

export type ReactivateUserModalServices = {
  reactivateUser: typeof reactivateUser;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type ReactivateUserModalProps = {
  open: boolean;
  user: BranchUser;
  onClose: () => void;
  onReactivated: () => void;
  onSessionEnded: () => void;
  services: ReactivateUserModalServices;
};

export function ReactivateUserModal({
  open,
  user,
  onClose,
  onReactivated,
  onSessionEnded,
  services,
}: ReactivateUserModalProps) {
  const {
    reactivateUser,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const sendToMyAccount = useSendToMyAccount();
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<ReactivateUserOutcome>({
    actionName: "Reactivar un usuario",
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

    const outcome = await run(() => reactivateUser(user.id));
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "ok" || outcome.kind === "not_found") {
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
        tone="info"
        icon={<RotateCcw />}
        headerLayout="centered"
        title={`¿Reactivar a ${user.firstName}?`}
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              fullWidth
              disabled={submitting}
              onPress={onClose}
            >
              Cancelar
            </Button>
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
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-center text-body text-text-subtle">
            Vuelve a entrar a la caja y al backoffice con su mismo correo, rol y passkeys.
          </p>
          {attemptFailed ? (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo reactivar el usuario"
              description="Probá de nuevo."
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
