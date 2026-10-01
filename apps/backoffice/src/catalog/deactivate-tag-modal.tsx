import type { TagSummary } from "@purosur/contracts";
import { Button, InlineNotice, Modal } from "@purosur/ui";
import { Ban, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type { deactivateTag } from "./tags-api";

export type DeactivateTagModalServices = {
  deactivateTag: typeof deactivateTag;
};

type DeactivateTagModalProps = {
  target: TagSummary | null;
  onClose: () => void;
  onDeactivated: () => void;
  onSessionEnded: () => void;
  services: DeactivateTagModalServices;
};

type DeactivateNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "alreadyChanged" }
  | { kind: "notFound" };

export function DeactivateTagModal({
  target,
  onClose,
  onDeactivated,
  onSessionEnded,
  services,
}: DeactivateTagModalProps) {
  const { deactivateTag } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<DeactivateNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && target) {
      setTitle(`¿Desactivar el distintivo "${target.name}"?`);
      setNotice(null);
      setSubmitting(false);
    }
  }, [open, target]);

  async function handleConfirm() {
    if (!target) {
      return;
    }
    setNotice(null);
    setSubmitting(true);
    const outcome = await deactivateTag(target.id);
    if (outcome.kind === "ok") {
      onDeactivated();
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
    setSubmitting(false);
    if (outcome.kind === "already_changed") {
      setNotice({ kind: "alreadyChanged" });
      return;
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    setNotice({ kind: "attemptFailed" });
  }

  const listOutdated = notice?.kind === "alreadyChanged" || notice?.kind === "notFound";

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
      icon={<Ban />}
      title={title}
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
          {listOutdated ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              disabled={submitting}
              onPress={onDeactivated}
            >
              Actualizar la lista
            </Button>
          ) : (
            <Button
              variant="primary"
              destructive
              size="large"
              icon={<Ban />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Desactivar
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">
          Deja de ofrecerse para asignar a un producto nuevo. Los productos que ya lo tienen lo
          conservan.
        </p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se desactivó el distintivo"
            description="Volvé a intentarlo."
          />
        )}
        {notice?.kind === "alreadyChanged" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title="Ya estaba desactivado" />
        )}
        {notice?.kind === "notFound" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Este distintivo ya no existe"
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
