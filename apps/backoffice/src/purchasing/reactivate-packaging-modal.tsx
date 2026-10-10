import type { PackagingSummary } from "@purosur/contracts";
import { Button, InlineNotice, Modal } from "@purosur/ui";
import { RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type { reactivatePackaging } from "./packagings-api";

export type ReactivatePackagingModalServices = {
  reactivatePackaging: typeof reactivatePackaging;
};

type ReactivatePackagingModalProps = {
  target: PackagingSummary | null;
  onClose: () => void;
  onReactivated: () => void;
  onSessionEnded: () => void;
  services: ReactivatePackagingModalServices;
};

type ReactivateNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "alreadyChanged" }
  | { kind: "saleUnitChanged" }
  | { kind: "notFound" };

export function ReactivatePackagingModal({
  target,
  onClose,
  onReactivated,
  onSessionEnded,
  services,
}: ReactivatePackagingModalProps) {
  const { reactivatePackaging } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<ReactivateNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && target) {
      setTitle(`¿Reactivar la presentación "${target.name}"?`);
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
    const outcome = await reactivatePackaging(target.id);
    if (outcome.kind === "ok") {
      onReactivated();
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
    if (outcome.kind === "sale_unit_changed") {
      setNotice({ kind: "saleUnitChanged" });
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
      tone="info"
      icon={<RotateCcw />}
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
              onPress={onReactivated}
            >
              Actualizar la lista
            </Button>
          ) : (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Reactivar
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">Vuelve a ofrecerse para compras nuevas.</p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se reactivó la presentación"
            description="Volvé a intentarlo."
          />
        )}
        {notice?.kind === "alreadyChanged" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title="Ya estaba activa" />
        )}
        {notice?.kind === "saleUnitChanged" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="La unidad de venta del producto cambió desde que se definió esta presentación"
            description="Editá su cantidad antes de reactivarla."
          />
        )}
        {notice?.kind === "notFound" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Esta presentación ya no existe"
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
