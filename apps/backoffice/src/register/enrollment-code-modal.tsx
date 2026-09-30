import { Button, InlineNotice, Modal } from "@purosur/ui";
import { Check, KeySquare, RotateCcw, ShieldX, TriangleAlert } from "lucide-react";
import { groupedCode } from "../platform/grouped-code";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type { RegisterSummary } from "./registers-api";

export type EmissionState =
  | { kind: "closed" }
  | { kind: "issuing"; register: RegisterSummary }
  | { kind: "attemptFailed"; register: RegisterSummary }
  | { kind: "rateLimited"; register: RegisterSummary; retryAfterSeconds: number }
  | { kind: "issued"; register: RegisterSummary; code: string };

type EnrollmentCodeModalProps = {
  emission: EmissionState;
  onClose: () => void;
  onDone: () => void;
  onRetry: (register: RegisterSummary) => void;
};

// Purely presentational: the click handler in RegistersListScreen starts the emission, never an
// effect here, so React Strict Mode's extra render (or a remount) can't refire the request.
export function EnrollmentCodeModal({
  emission,
  onClose,
  onDone,
  onRetry,
}: EnrollmentCodeModalProps) {
  const open = emission.kind !== "closed";
  const isIssued = emission.kind === "issued";

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<KeySquare />}
      {...(emission.kind !== "closed" ? { context: emission.register.name } : {})}
      title="Código de alta"
      // An emission in flight can't be dismissed: the cloud may already have replaced the
      // register's pending code, and only this response carries the new one.
      closable={emission.kind !== "issuing"}
      footer={
        <Button
          variant="primary"
          size="large"
          icon={<Check />}
          fullWidth
          disabled={!isIssued}
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
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              onPress={() => onRetry(emission.register)}
            >
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
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              onPress={() => onRetry(emission.register)}
            >
              Reintentar
            </Button>
          </>
        )}
        {emission.kind === "issued" && (
          <>
            <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-subtle p-4">
              <p className="text-title text-text-accent tracking-md">
                {groupedCode(emission.code)}
              </p>
              <p className="text-text-subtle text-detail">
                Vence en 15 minutos · se usa una sola vez
              </p>
            </div>
            <p className="text-body text-text">
              En la notebook nueva, al abrir la caja por primera vez, se escribe este código.
              Después de 5 intentos equivocados deja de servir y hay que emitir otro.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
