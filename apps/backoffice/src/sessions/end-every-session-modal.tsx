import { Button, InlineNotice, Modal } from "@purosur/ui";
import { LogOut, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type { endEverySession } from "./session-api";

export type EndEverySessionModalServices = {
  endEverySession: typeof endEverySession;
};

type EndEverySessionModalProps = {
  open: boolean;
  onClose: () => void;
  onSessionEnded: () => void;
  services: EndEverySessionModalServices;
};

type Notice = { kind: "failed" } | { kind: "rateLimited"; retryAfterSeconds: number };

export function EndEverySessionModal({
  open,
  onClose,
  onSessionEnded,
  services,
}: EndEverySessionModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setNotice(null);
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    setNotice(null);
    setSubmitting(true);
    const outcome = await services.endEverySession();
    if (outcome.kind === "ok" || outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    setNotice(
      outcome.kind === "rate_limited"
        ? { kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds }
        : { kind: "failed" },
    );
    setSubmitting(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="confirmation"
      tone="error"
      icon={<LogOut />}
      title="¿Cerrar todas las sesiones?"
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={onClose}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            destructive
            size="large"
            icon={<LogOut />}
            fullWidth
            disabled={submitting}
            onPress={() => void handleConfirm()}
          >
            Cerrar todas las sesiones
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">
          Se cierran todas las sesiones abiertas del backoffice, también la tuya. Cada persona, vos
          incluido, vuelve a entrar con su passkey.
        </p>
        {notice?.kind === "failed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudieron cerrar las sesiones"
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
      </div>
    </Modal>
  );
}
