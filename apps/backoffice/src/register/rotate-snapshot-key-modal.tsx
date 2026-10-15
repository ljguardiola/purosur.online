import { Button, InlineNotice, Modal } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { RefreshCw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type {
  RotateSnapshotKeyOutcome,
  rotateSnapshotKey,
  SnapshotBackupRegister,
} from "./snapshot-backups-api";

export type RotateSnapshotKeyModalServices = {
  rotateSnapshotKey: typeof rotateSnapshotKey;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type RotateSnapshotKeyModalProps = {
  target: SnapshotBackupRegister | null;
  onClose: () => void;
  onRotated: (keyVersion: number) => void;
  onRegisterNotFound: () => void;
  onSessionEnded: () => void;
  services: RotateSnapshotKeyModalServices;
};

type Notice =
  | { kind: "noKeyYet" }
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

export function RotateSnapshotKeyModal({
  target,
  onClose,
  onRotated,
  onRegisterNotFound,
  onSessionEnded,
  services,
}: RotateSnapshotKeyModalProps) {
  const {
    rotateSnapshotKey,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [rotating, setRotating] = useState(false);
  const { run, modal } = useAuthorization<RotateSnapshotKeyOutcome>({
    actionName: "Rotar la clave de cifrado",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (target === null) {
      setNotice(null);
    }
  }, [target]);

  async function rotate(register: SnapshotBackupRegister) {
    setNotice(null);
    setRotating(true);
    const outcome = await run(() => rotateSnapshotKey(register.id));
    setRotating(false);
    if (outcome.kind === "cancelled") {
      return;
    }
    if (outcome.kind === "ok") {
      onRotated(outcome.value.keyVersion);
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else if (outcome.kind === "not_found") {
      onRegisterNotFound();
    } else if (outcome.kind === "no_key_yet") {
      setNotice({ kind: "noKeyYet" });
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setNotice({ kind: "attemptFailed" });
    }
  }

  return (
    <>
      <Modal
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="confirmation"
        tone="warning"
        icon={<RefreshCw />}
        title="Rotar la clave de cifrado"
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              fullWidth
              disabled={rotating}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<RefreshCw />}
              fullWidth
              disabled={rotating}
              onPress={() => target && void rotate(target)}
            >
              Rotar la clave
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "noKeyYet" && (
            <InlineNotice
              tone="warning"
              icon={<TriangleAlert />}
              title="Esta caja todavía no tiene una clave"
              description="No hay nada para rotar hasta que genere su primer backup."
            />
          )}
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo rotar la clave"
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
          <p className="text-body text-text">
            {`Vas a rotar la clave de cifrado de ${target?.name ?? ""}. Solo los backups que se generen desde ahora usan la clave nueva. Los que ya existen se siguen pudiendo leer.`}
          </p>
        </div>
      </Modal>
      {modal}
    </>
  );
}
