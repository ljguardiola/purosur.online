import { Button, InlineNotice, Modal } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Ban, ShieldOff, ShieldX, TriangleAlert, X } from "lucide-react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import { useAuthorizedAttempt } from "../platform/use-authorized-attempt";
import type { RevokeEveryInstallationOutcome, revokeEveryInstallation } from "./registers-api";

export type RevokeEveryInstallationModalServices = {
  revokeEveryInstallation: typeof revokeEveryInstallation;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type RevokeEveryInstallationModalProps = {
  open: boolean;
  onClose: () => void;
  onRevoked: (revocation: { revokedRegisters: number }) => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
  services: RevokeEveryInstallationModalServices;
};

export function RevokeEveryInstallationModal({
  open,
  onClose,
  onRevoked,
  onOutdated,
  onSessionEnded,
  services,
}: RevokeEveryInstallationModalProps) {
  const {
    revokeEveryInstallation,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const {
    attempt,
    running: revoking,
    notice,
    modal,
  } = useAuthorizedAttempt<RevokeEveryInstallationOutcome, "noActiveInstallation">({
    open,
    actionName: "Revocar todas las instalaciones",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  function revoke() {
    return attempt(revokeEveryInstallation, (outcome, opening) => {
      if (outcome.kind === "ok") {
        if (opening.current) {
          onClose();
        }
        onRevoked({ revokedRegisters: outcome.value.revokedRegisters });
      } else if (outcome.kind === "no_active_installation") {
        opening.showNotice("noActiveInstallation");
        onOutdated();
      }
    });
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
        context="Todas las sucursales"
        title="Revocar todas las instalaciones"
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
              icon={<ShieldOff />}
              fullWidth
              disabled={revoking}
              onPress={() => void revoke()}
            >
              Revocar todas
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "noActiveInstallation" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudieron revocar las instalaciones"
              description="Ninguna caja tiene una instalación vigente para revocar."
            />
          )}
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudieron revocar las instalaciones"
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
            Todas las cajas de todas las sucursales dejan de poder sincronizar en el momento. Se
            cambian las claves de sus backups y de sus tickets de respaldo, así que lo que tengan
            guardado no sirve para leer datos nuevos.
          </p>
          <InlineNotice
            tone="warning"
            icon={<TriangleAlert />}
            description="Para volver a usar cada caja hay que darla de alta de nuevo con un código."
          />
        </div>
      </Modal>
      {modal}
    </>
  );
}
