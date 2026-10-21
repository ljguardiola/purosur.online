import { Button, Modal } from "@purosur/ui";
import { RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  type SupplierPriceListChangeNotice,
  SupplierPriceListChangeNotices,
  supplierPriceListChangeNoticeOf,
  supplierPriceListChangeOutdates,
} from "./supplier-price-list-change-notice";
import type {
  discardSupplierPriceList,
  SupplierPriceListReviewList,
} from "./supplier-price-lists-api";

export type DiscardSupplierPriceListModalServices = {
  discardSupplierPriceList: typeof discardSupplierPriceList;
};

type DiscardSupplierPriceListModalProps = {
  target: SupplierPriceListReviewList | null;
  services: DiscardSupplierPriceListModalServices;
  onDiscarded: () => void;
  onOutdated: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function DiscardSupplierPriceListModal({
  target,
  services,
  onDiscarded,
  onOutdated,
  onClose,
  onSessionEnded,
}: DiscardSupplierPriceListModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<SupplierPriceListChangeNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target) {
      setTitle(`¿Descartar la lista de ${target.supplier.name}?`);
      setNotice(null);
      setSubmitting(false);
    }
  }, [target]);

  async function handleConfirm() {
    if (!target) {
      return;
    }
    setNotice(null);
    setSubmitting(true);
    const outcome = await services.discardSupplierPriceList(target.id, { version: target.version });
    if (outcome.kind === "ok") {
      onDiscarded();
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
    setNotice(supplierPriceListChangeNoticeOf(outcome));
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
      icon={<Trash2 />}
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
          {supplierPriceListChangeOutdates(notice) ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              onPress={onOutdated}
            >
              Actualizar la lista
            </Button>
          ) : (
            <Button
              variant="primary"
              destructive
              size="large"
              icon={<Trash2 />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Descartar la lista
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-text">
          No se guarda ningún ítem ni ningún precio de esta lista.
        </p>
        <SupplierPriceListChangeNotices notice={notice} failedTitle="No se descartó la lista" />
      </div>
    </Modal>
  );
}
