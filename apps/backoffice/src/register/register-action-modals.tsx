import { useRef, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { AssignPointTerminalModal } from "./assign-point-terminal-modal";
import { AssignQrPointOfSaleModal } from "./assign-qr-point-of-sale-modal";
import { ConsultBitlockerRecoveryKeyModal } from "./consult-bitlocker-recovery-key-modal";
import { type EmissionState, EnrollmentCodeModal } from "./enrollment-code-modal";
import { LoadBitlockerRecoveryKeyModal } from "./load-bitlocker-recovery-key-modal";
import { useRefreshRegisters, useReloadRegister } from "./register-queries";
import type { EmitEnrollmentCodeOutcome, RegisterSummary } from "./registers-api";
import type { RegistersListScreenServices } from "./registers-list-services";
import { RevokeRegisterModal } from "./revoke-register-modal";

export type RegisterActions = {
  emitCode: (register: RegisterSummary) => void;
  revoke: (register: RegisterSummary) => void;
  loadKey: (register: RegisterSummary) => void;
  consultKey: (register: RegisterSummary) => void;
  assignTerminal: (register: RegisterSummary) => void;
  assignQr: (register: RegisterSummary) => void;
};

export function useRegisterActions({
  services,
  onSessionEnded,
}: {
  services: RegistersListScreenServices;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  const {
    fetchRegisters,
    emitEnrollmentCode,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const refreshRegisters = useRefreshRegisters();
  const reloadRegister = useReloadRegister({ fetchRegisters });
  const [terminalTarget, setTerminalTarget] = useState<RegisterSummary | null>(null);
  const [qrTarget, setQrTarget] = useState<RegisterSummary | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RegisterSummary | null>(null);
  const [loadKeyTarget, setLoadKeyTarget] = useState<RegisterSummary | null>(null);
  const [consultKeyTarget, setConsultKeyTarget] = useState<RegisterSummary | null>(null);
  const [emission, setEmission] = useState<EmissionState>({ kind: "closed" });
  const { run: runEmission, modal: emissionAuthModal } =
    useAuthorization<EmitEnrollmentCodeOutcome>({
      actionName: "Emitir un código de alta",
      onSessionEnded,
      services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
    });
  const latestEmission = useRef(0);

  // Guards a second Enter/Space activation before the first request settles (the modal backdrop
  // blocks other rows).
  async function handleEmitClick(register: RegisterSummary) {
    if (emission.kind === "issuing") {
      return;
    }
    latestEmission.current += 1;
    const thisEmission = latestEmission.current;
    setEmission({ kind: "issuing", register });

    const outcome = await runEmission(() => emitEnrollmentCode(register.id));
    if (thisEmission !== latestEmission.current) {
      return;
    }
    // The attempt always reaches the server before "cancelled" can resolve (only
    // `authorization_required` opens the modal that cancel dismisses), so reload every time.
    if (outcome.kind === "cancelled") {
      setEmission({ kind: "closed" });
      void refreshRegisters();
      return;
    }
    if (outcome.kind === "ok") {
      setEmission({ kind: "issued", register, code: outcome.value.code });
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
    if (outcome.kind === "not_found") {
      setEmission({ kind: "closed" });
      void refreshRegisters();
      return;
    }
    if (outcome.kind === "rate_limited") {
      setEmission({ kind: "rateLimited", register, retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    setEmission({ kind: "attemptFailed", register });
  }

  // Reloads after every outcome, not just an issued code: a failure seen here (a dropped
  // connection, an unreadable 200) may still follow a code the cloud already committed.
  function closeEmission() {
    latestEmission.current += 1;
    setEmission({ kind: "closed" });
    void refreshRegisters();
  }

  const actions: RegisterActions = {
    emitCode: (register) => void handleEmitClick(register),
    revoke: setRevokeTarget,
    loadKey: setLoadKeyTarget,
    consultKey: setConsultKeyTarget,
    assignTerminal: setTerminalTarget,
    assignQr: setQrTarget,
  };

  const modals = (
    <>
      <AssignPointTerminalModal
        target={terminalTarget}
        onClose={() => setTerminalTarget(null)}
        onSaved={() => {
          setTerminalTarget(null);
          void refreshRegisters();
        }}
        reload={reloadRegister}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <AssignQrPointOfSaleModal
        target={qrTarget}
        onClose={() => setQrTarget(null)}
        onSaved={() => {
          setQrTarget(null);
          void refreshRegisters();
        }}
        reload={reloadRegister}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <EnrollmentCodeModal
        emission={emission}
        onClose={closeEmission}
        onDone={closeEmission}
        onRetry={(register) => void handleEmitClick(register)}
      />
      <RevokeRegisterModal
        target={revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onRevoked={() => void refreshRegisters()}
        onOutdated={() => void refreshRegisters()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <LoadBitlockerRecoveryKeyModal
        target={loadKeyTarget}
        onClose={() => setLoadKeyTarget(null)}
        onLoaded={() => void refreshRegisters()}
        onOutdated={() => void refreshRegisters()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <ConsultBitlockerRecoveryKeyModal
        target={consultKeyTarget}
        onClose={() => setConsultKeyTarget(null)}
        onOutdated={() => void refreshRegisters()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      {emissionAuthModal}
    </>
  );

  return { actions, modals };
}
