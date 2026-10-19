import { Button, InlineNotice, Modal } from "@purosur/ui";
import { Ban, ShieldOff, TriangleAlert, X } from "lucide-react";
import {
  type AuthorizedAttemptServices,
  useAuthorizedAttempt,
} from "../platform/use-authorized-attempt";
import type {
  CompromiseResponse,
  revokeEveryInstallation,
  StepOutcome,
} from "./compromise-response-api";
import { isRunbookRefusal } from "./compromise-response-api";
import { StepAttemptNotices } from "./step-attempt-notices";

export type RevokeInstallationsStepModalServices = AuthorizedAttemptServices & {
  revokeEveryInstallation: typeof revokeEveryInstallation;
};

type RevokeInstallationsStepModalProps = {
  open: boolean;
  onClose: () => void;
  onDone: (runbook: CompromiseResponse) => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
  services: RevokeInstallationsStepModalServices;
};

export function RevokeInstallationsStepModal({
  open,
  onClose,
  onDone,
  onOutdated,
  onSessionEnded,
  services,
}: RevokeInstallationsStepModalProps) {
  const {
    revokeEveryInstallation,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const { attempt, running, notice, modal } = useAuthorizedAttempt<StepOutcome, "outdated">({
    open,
    actionName: "Revocar todas las instalaciones",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  function revoke() {
    return attempt(revokeEveryInstallation, (outcome, opening) => {
      if (outcome.kind === "ok") {
        onDone(outcome.value);
      } else if (isRunbookRefusal(outcome.kind)) {
        opening.showNotice("outdated");
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
              disabled={running}
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
              disabled={running}
              onPress={() => void revoke()}
            >
              Revocar todas
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <StepAttemptNotices notice={notice} failedTitle="No se pudo revocar las instalaciones" />
          <p className="text-body text-text">
            Todas las cajas de todas las sucursales dejan de poder sincronizar en el momento, y lo
            que tengan guardado no sirve para leer datos nuevos.
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
