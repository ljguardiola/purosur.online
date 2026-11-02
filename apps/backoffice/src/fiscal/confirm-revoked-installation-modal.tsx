import { Button, InlineNotice, Modal } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { ShieldCheck, ShieldX, TriangleAlert, X } from "lucide-react";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import { useAuthorizedAttempt } from "../platform/use-authorized-attempt";
import type { confirmRevokedInstallation } from "./fortnight-presentations-api";
import { revokedInstallationDayAndTime } from "./revoked-installation-moments";
import type { RevokedInstallationTarget } from "./revoked-installation-target";

export type ConfirmRevokedInstallationModalServices = {
  confirmRevokedInstallation: typeof confirmRevokedInstallation;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type ConfirmRevokedInstallationModalProps = {
  target: RevokedInstallationTarget | null;
  onClose: () => void;
  onConfirmed: (confirmed: RevokedInstallationTarget) => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
  services: ConfirmRevokedInstallationModalServices;
};

export function ConfirmRevokedInstallationModal({
  target,
  onClose,
  onConfirmed,
  onOutdated,
  onSessionEnded,
  services,
}: ConfirmRevokedInstallationModalProps) {
  const {
    confirmRevokedInstallation,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const open = target !== null;
  const {
    attempt,
    running: confirming,
    notice,
    modal,
  } = useAuthorizedAttempt<
    Awaited<ReturnType<typeof confirmRevokedInstallation>>,
    "reportMovedOn" | "alreadyConfirmed" | "stillProcessing" | "noLongerHoldsBack" | "invalid"
  >({
    open,
    actionName: "Confirmar la instalación revocada",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  function confirm(item: RevokedInstallationTarget) {
    return attempt(
      () =>
        confirmRevokedInstallation({
          point_of_sale_number: item.pointOfSaleNumber,
          fortnight_start: item.fortnight.start,
          installation_id: item.installationId,
        }),
      (outcome, opening) => {
        if (outcome.kind === "ok") {
          if (opening.current) {
            onClose();
          }
          onConfirmed(item);
        } else if (outcome.kind === "validation_failed") {
          opening.showNotice("invalid");
        } else if (outcome.kind === "already_presented") {
          opening.showNotice("reportMovedOn");
          onOutdated();
        } else if (outcome.kind === "already_confirmed") {
          opening.showNotice("alreadyConfirmed");
          onOutdated();
        } else if (outcome.kind === "holds_unapplied_events") {
          opening.showNotice("stillProcessing");
          onOutdated();
        } else {
          opening.showNotice("noLongerHoldsBack");
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
        tone="warning"
        icon={<ShieldCheck />}
        title={target ? "Confirmar la instalación revocada" : ""}
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              fullWidth
              disabled={confirming}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<ShieldCheck />}
              fullWidth
              disabled={confirming}
              onPress={() => target && void confirm(target)}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "reportMovedOn" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este informe ya siguió su curso."
            />
          )}
          {notice?.kind === "alreadyConfirmed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Alguien ya confirmó esta instalación para este informe."
            />
          )}
          {notice?.kind === "stillProcessing" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="La nube todavía no terminó de procesar lo que esta instalación sincronizó."
            />
          )}
          {notice?.kind === "noLongerHoldsBack" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Esta instalación ya no frena el informe."
            />
          )}
          {(notice?.kind === "attemptFailed" || notice?.kind === "invalid") && (
            <ActionFailureNotice title="No se pudo confirmar la instalación revocada" />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(notice.retryAfterSeconds)}
            />
          )}
          {target ? (
            <p className="text-body text-text">
              {`La instalación de ${target.registerName} se revocó el ${revokedInstallationDayAndTime(target.revokedAt)}. Confirmá que no emitió ningún comprobante sin conexión que no haya llegado a la nube.`}
            </p>
          ) : null}
          <InlineNotice
            tone="warning"
            icon={<TriangleAlert />}
            description="Si emitió alguno, el informe a ARCA quedaría incompleto."
          />
        </div>
      </Modal>
      {modal}
    </>
  );
}
