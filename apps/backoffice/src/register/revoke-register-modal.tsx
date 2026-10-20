import { Button, InlineNotice, Modal } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Ban, Key, ShieldX, TriangleAlert, X } from "lucide-react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import { useAuthorizedAttempt } from "../platform/use-authorized-attempt";
import { registerModalContext } from "./register-modal-context";
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
  const open = target !== null;
  const {
    attempt,
    running: revoking,
    notice,
    modal,
  } = useAuthorizedAttempt<RevokeRegisterOutcome, "notFound" | "noActiveInstallation">({
    open,
    actionName: "Revocar por pérdida o robo",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  function revoke(register: RegisterSummary) {
    return attempt(
      () => revokeRegister(register.id),
      (outcome, opening) => {
        if (outcome.kind === "ok") {
          if (opening.current) {
            onClose();
          }
          onRevoked();
        } else if (outcome.kind === "not_found") {
          opening.showNotice("notFound");
          onOutdated();
        } else if (outcome.kind === "no_active_installation") {
          opening.showNotice("noActiveInstallation");
          onOutdated();
        }
      },
    );
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
        context={registerModalContext(target)}
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
