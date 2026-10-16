import { Button, InlineNotice, Modal, plural } from "@purosur/ui";
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
import type { RemoveEveryUserPasskeyOutcome, removeEveryUserPasskey } from "./user-credentials-api";

export type RemoveEveryUserPasskeyModalServices = {
  removeEveryUserPasskey: typeof removeEveryUserPasskey;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type RemoveEveryUserPasskeyModalProps = {
  open: boolean;
  userId: string;
  userName: string;
  passkeyCount: number;
  onClose: () => void;
  onRemoved: () => void;
  onSessionEnded: () => void;
  services: RemoveEveryUserPasskeyModalServices;
};

type Notice =
  | { kind: "attemptFailed" }
  | { kind: "ownAccount" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

export function RemoveEveryUserPasskeyModal({
  open,
  userId,
  userName,
  passkeyCount,
  onClose,
  onRemoved,
  onSessionEnded,
  services,
}: RemoveEveryUserPasskeyModalProps) {
  const {
    removeEveryUserPasskey,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<RemoveEveryUserPasskeyOutcome>({
    actionName: "Dar de baja todas las passkeys",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (open) {
      setNotice(null);
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    setNotice(null);
    setSubmitting(true);

    const outcome = await run(() => removeEveryUserPasskey(userId));
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "ok" || outcome.kind === "no_passkeys" || outcome.kind === "not_found") {
      onRemoved();
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
    if (outcome.kind === "own_account") {
      setNotice({ kind: "ownAccount" });
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setNotice({ kind: "attemptFailed" });
    }
    setSubmitting(false);
  }

  const subject = plural(passkeyCount, {
    one: "Su única passkey deja",
    other: `Sus ${passkeyCount} passkeys dejan`,
  });

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
        title={`¿Dar de baja todas las passkeys de ${userName}?`}
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
              Dar de baja todas
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-body text-text">
            {`${subject} de servir para entrar y se cierran sus sesiones abiertas. Para volver a entrar, ${userName} va a tener que pedir el enlace de recuperación por correo.`}
          </p>
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudieron dar de baja las passkeys"
              description="Probá de nuevo."
            />
          )}
          {notice?.kind === "ownAccount" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No podés dar de baja tus propias passkeys"
              description="Hacelo desde Mi cuenta."
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
      {modal}
    </>
  );
}
