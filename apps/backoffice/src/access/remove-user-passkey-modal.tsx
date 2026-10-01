import { Button, InlineNotice, Modal } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { ShieldX, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { Passkey } from "./passkey-api";
import type { RemoveUserPasskeyOutcome, removeUserPasskey } from "./users-api";

export type RemoveUserPasskeyModalServices = {
  removeUserPasskey: typeof removeUserPasskey;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type RemoveUserPasskeyModalProps = {
  target: Passkey | null;
  userId: string;
  userName: string;
  isOnlyPasskey: boolean;
  onClose: () => void;
  onRemoved: (passkeyId: string) => void;
  onSessionEnded: () => void;
  services: RemoveUserPasskeyModalServices;
};

export function RemoveUserPasskeyModal({
  target,
  userId,
  userName,
  isOnlyPasskey,
  onClose,
  onRemoved,
  onSessionEnded,
  services,
}: RemoveUserPasskeyModalProps) {
  const {
    removeUserPasskey,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<RemoveUserPasskeyOutcome>({
    actionName: "Dar de baja una passkey",
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
    if (!target) {
      return;
    }
    setAttemptFailed(false);
    setRateLimitedSeconds(null);
    setSubmitting(true);

    const outcome = await run(() => removeUserPasskey(userId, target.id));
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "ok" || outcome.kind === "not_found") {
      onRemoved(target.id);
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
        tone="error"
        icon={<Trash2 />}
        title={`¿Dar de baja la passkey de ${userName}?`}
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
              icon={<Trash2 />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Dar de baja
            </Button>
          </>
        }
      >
        {target ? (
          <div className="flex flex-col gap-4">
            <p className="text-body text-text">
              {`«${target.name}» deja de servir para entrar.`}
              {isOnlyPasskey
                ? ` Es su única passkey: para volver a entrar, ${userName} va a tener que pedir el enlace de recuperación por correo.`
                : ""}
            </p>
            {attemptFailed ? (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="No se pudo dar de baja la passkey"
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
        ) : null}
      </Modal>
      {modal}
    </>
  );
}
