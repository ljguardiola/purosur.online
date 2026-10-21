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
import type { removeSupplierPriceListRow, SupplierPriceListRow } from "./supplier-price-lists-api";

export type RemoveSupplierPriceListRowModalServices = {
  removeSupplierPriceListRow: typeof removeSupplierPriceListRow;
};

type RemoveSupplierPriceListRowModalProps = {
  list: { id: string; version: number };
  target: SupplierPriceListRow | null;
  services: RemoveSupplierPriceListRowModalServices;
  onRemoved: () => void;
  onOutdated: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function RemoveSupplierPriceListRowModal({
  list,
  target,
  services,
  onRemoved,
  onOutdated,
  onClose,
  onSessionEnded,
}: RemoveSupplierPriceListRowModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<SupplierPriceListChangeNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target) {
      setTitle(`¿Quitar "${target.description}" de la lista?`);
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
    const outcome = await services.removeSupplierPriceListRow(list.id, target.id, {
      version: list.version,
    });
    if (outcome.kind === "ok") {
      onRemoved();
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
              Quitar el ítem
            </Button>
          )}
        </>
      }
    >
      <SupplierPriceListChangeNotices notice={notice} failedTitle="No se quitó el ítem" />
    </Modal>
  );
}
