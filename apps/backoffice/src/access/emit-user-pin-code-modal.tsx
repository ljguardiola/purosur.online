import { Button, InlineNotice, Modal } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, KeyRound, RotateCcw, ShieldX, TriangleAlert } from "lucide-react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { groupedCode } from "../register/enrollment-code";
import { pinCodeValidity } from "./pin-code-validity";
import type { authorizeSession, fetchSessionAuthorizationOptions } from "./session-api";
import type { BranchUser, emitUserPinCode } from "./users-api";

export type EmitUserPinCodeModalServices = {
  emitUserPinCode: typeof emitUserPinCode;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type PinCodeUser = Pick<BranchUser, "id" | "firstName">;

export type EmissionState =
  | { kind: "closed" }
  | { kind: "issuing"; user: PinCodeUser }
  | { kind: "attemptFailed"; user: PinCodeUser }
  | { kind: "rateLimited"; user: PinCodeUser; retryAfterSeconds: number }
  | { kind: "issued"; user: PinCodeUser; code: string };

type EmitUserPinCodeModalProps = {
  emission: EmissionState;
  onClose: () => void;
  onDone: () => void;
  onRetry: () => void;
};

// Purely presentational: the click handler starts the emission, never an effect here, so React
// Strict Mode's extra render (or a remount) can't refire the request.
export function EmitUserPinCodeModal({
  emission,
  onClose,
  onDone,
  onRetry,
}: EmitUserPinCodeModalProps) {
  return (
    <Modal
      open={emission.kind !== "closed"}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<KeyRound />}
      {...(emission.kind !== "closed" ? { context: emission.user.firstName } : {})}
      title="Código para reiniciar el PIN"
      // An emission in flight can't be dismissed: the cloud may already have replaced the
      // user's PIN, and only this response carries the code that replaces it.
      closable={emission.kind !== "issuing"}
      footer={
        <Button
          variant="primary"
          size="large"
          icon={<Check />}
          fullWidth
          disabled={emission.kind !== "issued"}
          onPress={onDone}
        >
          Listo
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {emission.kind === "issuing" && <p role="status">Emitiendo el código…</p>}
        {emission.kind === "attemptFailed" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo emitir el código"
              description="Probá de nuevo."
            />
            <Button variant="secondary" icon={<RotateCcw />} onPress={onRetry}>
              Reintentar
            </Button>
          </>
        )}
        {emission.kind === "rateLimited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(emission.retryAfterSeconds)}
            />
            <Button variant="secondary" icon={<RotateCcw />} onPress={onRetry}>
              Reintentar
            </Button>
          </>
        )}
        {emission.kind === "issued" && (
          <>
            <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-subtle p-4">
              <p className="font-bold font-mono text-text-accent text-title tracking-md">
                {groupedCode(emission.code)}
              </p>
              <p className="text-text-subtle text-detail">
                {`Vence en ${pinCodeValidity()} · se usa una sola vez`}
              </p>
            </div>
            <p className="text-body text-text">
              {`En la caja, con internet, ${emission.user.firstName} escribe este código y elige un PIN nuevo de al menos 6 dígitos. Su PIN anterior ya no sirve.`}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
