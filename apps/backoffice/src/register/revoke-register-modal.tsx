import { Button, InlineNotice, Modal } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Ban, Key, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { RegisterSummary, RevokeRegisterOutcome, revokeRegister } from "./registers-api";

export type RevokeRegisterModalServices = {
  revokeRegister: typeof revokeRegister;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type RevokeRegisterModalProps = {
  target: RegisterSummary | null;
  onClose: () => void;
  onRevoked: () => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
  services: RevokeRegisterModalServices;
};

type Notice =
  | { kind: "notFound" }
  | { kind: "noActiveInstallation" }
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

function contextOf(register: RegisterSummary | null): string {
  if (register === null) {
    return "";
  }
  return register.installation === null
    ? register.name
    : `${register.name} · ${register.installation.hostname}`;
}

export function RevokeRegisterModal({
  target,
  onClose,
  onRevoked,
  onOutdated,
  onSessionEnded,
  services,
}: RevokeRegisterModalProps) {
  const {
    revokeRegister,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [revoking, setRevoking] = useState(false);
  const { run, modal } = useAuthorization<RevokeRegisterOutcome>({
    actionName: "Revocar por pérdida o robo",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  const open = target !== null;
  const openingRef = useRef(0);

  useEffect(() => {
    openingRef.current += 1;
    if (open) {
      setNotice(null);
      setRevoking(false);
    }
  }, [open]);

  async function revoke(register: RegisterSummary) {
    setNotice(null);
    setRevoking(true);
    const opening = openingRef.current;
    const outcome = await run(() => revokeRegister(register.id));
    const sameOpening = opening === openingRef.current;
    const showNotice = (shown: Notice) => {
      if (sameOpening) {
        setNotice(shown);
      }
    };
    if (sameOpening) {
      setRevoking(false);
    }
    if (outcome.kind === "cancelled") {
      return;
    }
    if (outcome.kind === "ok") {
      onRevoked();
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else if (outcome.kind === "not_found") {
      showNotice({ kind: "notFound" });
      onOutdated();
    } else if (outcome.kind === "no_active_installation") {
      showNotice({ kind: "noActiveInstallation" });
      onOutdated();
    } else if (outcome.kind === "rate_limited") {
      showNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      showNotice({ kind: "attemptFailed" });
    }
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
        icon={<Ban />}
        context={contextOf(target)}
        title="Revocar por pérdida o robo"
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              fullWidth
              disabled={revoking}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              destructive
              size="large"
              icon={<Key />}
              fullWidth
              disabled={revoking}
              onPress={() => target && void revoke(target)}
            >
              Revocar la caja
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo revocar la caja"
              description="No se encontró la caja."
            />
          )}
          {notice?.kind === "noActiveInstallation" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo revocar la caja"
              description="La caja ya no tiene una instalación activa."
            />
          )}
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo revocar la caja"
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
            La notebook deja de poder sincronizar en el momento. Se cambian las claves de sus
            backups y de sus tickets de respaldo, así que lo que tenga guardado no sirve para leer
            datos nuevos.
          </p>
          <p className="text-body text-text">
            Todas las personas de esta sucursal van a tener que elegir un PIN nuevo.
          </p>
          <InlineNotice
            tone="warning"
            icon={<TriangleAlert />}
            description="Para volver a usar la caja hay que darla de alta de nuevo con un código."
          />
        </div>
      </Modal>
      {modal}
    </>
  );
}
