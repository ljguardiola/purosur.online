import { Button, Modal } from "@purosur/ui";
import { KeyRound, X } from "lucide-react";
import type { CompromiseResponse, forcePinResets, StepOutcome } from "./compromise-response-api";
import { isRunbookRefusal } from "./compromise-response-api";
import { StepAttemptNotices } from "./step-attempt-notices";
import { type StepAttemptServices, useStepAttempt } from "./use-step-attempt";

export type ForcePinResetsStepModalServices = StepAttemptServices & {
  forcePinResets: typeof forcePinResets;
};

type ForcePinResetsStepModalProps = {
  open: boolean;
  onClose: () => void;
  onDone: (runbook: CompromiseResponse) => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
  services: ForcePinResetsStepModalServices;
};

export function ForcePinResetsStepModal({
  open,
  onClose,
  onDone,
  onOutdated,
  onSessionEnded,
  services,
}: ForcePinResetsStepModalProps) {
  const {
    forcePinResets,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const { attempt, running, notice, modal } = useStepAttempt<StepOutcome, "outdated">({
    open,
    actionName: "Forzar el reinicio de PIN",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  function force() {
    return attempt(forcePinResets, (outcome, opening) => {
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
        icon={<KeyRound />}
        context="Todas las sucursales"
        title="Forzar el reinicio de PIN"
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
              icon={<KeyRound />}
              fullWidth
              disabled={running}
              onPress={() => void force()}
            >
              Forzar el reinicio
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <StepAttemptNotices notice={notice} failedTitle="No se pudo forzar el reinicio de PIN" />
          <p className="text-body text-text">
            Todos los usuarios de todas las sucursales tienen que definir un nuevo PIN en la caja
            antes de volver a usarla.
          </p>
        </div>
      </Modal>
      {modal}
    </>
  );
}
