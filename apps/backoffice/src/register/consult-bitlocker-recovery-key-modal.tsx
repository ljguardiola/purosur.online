import { Button, InlineNotice, LoadingPlaceholder, Modal } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, Info, KeyRound, ShieldX, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import { registerModalContext } from "./register-modal-context";
import type {
  ConsultBitlockerRecoveryKeyOutcome,
  consultBitlockerRecoveryKey,
  RegisterSummary,
} from "./registers-api";
import { useRevocationAttempt } from "./use-revocation-attempt";

export type ConsultBitlockerRecoveryKeyModalServices = {
  consultBitlockerRecoveryKey: typeof consultBitlockerRecoveryKey;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type ConsultBitlockerRecoveryKeyModalProps = {
  target: RegisterSummary | null;
  onClose: () => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
  services: ConsultBitlockerRecoveryKeyModalServices;
};

type ConsultedKey = { recoveryKey: string; keyIdentifier: string };

const BLOCKS_PER_LINE = 4;

function keyLines(recoveryKey: string): [string, string] {
  const blocks = recoveryKey.split("-");
  return [blocks.slice(0, BLOCKS_PER_LINE).join("-"), blocks.slice(BLOCKS_PER_LINE).join("-")];
}

export function ConsultBitlockerRecoveryKeyModal({
  target,
  onClose,
  onOutdated,
  onSessionEnded,
  services,
}: ConsultBitlockerRecoveryKeyModalProps) {
  const {
    consultBitlockerRecoveryKey,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const open = target !== null;
  const [consulted, setConsulted] = useState<ConsultedKey | null>(null);
  const requestedFor = useRef<string | null>(null);
  const {
    attempt,
    revoking: consulting,
    notice,
    modal,
  } = useRevocationAttempt<
    ConsultBitlockerRecoveryKeyOutcome,
    "notFound" | "noCurrentInstallation" | "notLoaded"
  >({
    open,
    actionName: "Consultar la clave de recuperación de BitLocker",
    onSessionEnded,
    onCancelled: onClose,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (target === null) {
      requestedFor.current = null;
      setConsulted(null);
      return;
    }
    if (requestedFor.current === target.id) {
      return;
    }
    requestedFor.current = target.id;
    void attempt(
      () => consultBitlockerRecoveryKey(target.id),
      (outcome, opening) => {
        if (outcome.kind === "ok") {
          if (requestedFor.current === target.id) {
            setConsulted(outcome.value);
          }
        } else if (outcome.kind === "not_found") {
          opening.showNotice("notFound");
          onOutdated();
        } else if (outcome.kind === "no_current_installation") {
          opening.showNotice("noCurrentInstallation");
          onOutdated();
        } else if (outcome.kind === "not_loaded") {
          opening.showNotice("notLoaded");
          onOutdated();
        }
      },
    );
  }, [target, attempt, consultBitlockerRecoveryKey, onOutdated]);

  const lines = consulted === null ? null : keyLines(consulted.recoveryKey);

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="standard"
        tone="info"
        icon={<KeyRound />}
        context={registerModalContext(target)}
        title="Clave de recuperación de BitLocker"
        closable
        footer={
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            disabled={consulting}
            onPress={onClose}
          >
            Listo
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo consultar la clave"
              description="No se encontró la caja."
            />
          )}
          {notice?.kind === "noCurrentInstallation" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo consultar la clave"
              description="La caja ya no tiene una instalación activa."
            />
          )}
          {notice?.kind === "notLoaded" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo consultar la clave"
              description="La caja no tiene una clave de recuperación cargada."
            />
          )}
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo consultar la clave"
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
          {consulting ? <LoadingPlaceholder variant="card" lines={2} /> : null}
          {consulted !== null && lines !== null && (
            <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-subtle p-4">
              <p className="font-bold font-mono text-text-accent text-title tracking-md">
                {lines[0]}
              </p>
              <p className="font-bold font-mono text-text-accent text-title tracking-md">
                {lines[1]}
              </p>
              <p className="text-text-subtle text-detail">
                Identificador de la clave: {consulted.keyIdentifier}
              </p>
            </div>
          )}
          <InlineNotice
            tone="info"
            icon={<Info />}
            description="Se usa solo si Windows la pide al arrancar la notebook, por ejemplo después de un cambio de hardware."
          />
        </div>
      </Modal>
      {modal}
    </>
  );
}
