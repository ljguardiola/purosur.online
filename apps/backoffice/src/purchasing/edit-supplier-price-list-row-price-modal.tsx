import { supplierPriceListRowPriceBodySchema } from "@purosur/contracts";
import { Button, Modal, useRequestForm } from "@purosur/ui";
import { Check, Pencil, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  type SupplierPriceListChangeNotice,
  SupplierPriceListChangeNotices,
  supplierPriceListChangeNoticeOf,
  supplierPriceListChangeOutdates,
} from "./supplier-price-list-change-notice";
import {
  EMPTY_ROW_PRICE_FORM,
  ROW_PRICE_FIELD_MESSAGES,
  ROW_PRICE_FIELDS,
  rowPriceFormValuesOf,
  rowPriceRequestFrom,
} from "./supplier-price-list-row-price-form";
import type {
  SupplierPriceListRow,
  setSupplierPriceListRowPrice,
} from "./supplier-price-lists-api";

export type EditSupplierPriceListRowPriceModalServices = {
  setSupplierPriceListRowPrice: typeof setSupplierPriceListRowPrice;
};

type EditSupplierPriceListRowPriceModalProps = {
  list: { id: string; version: number };
  target: SupplierPriceListRow | null;
  services: EditSupplierPriceListRowPriceModalServices;
  onSaved: () => void;
  onOutdated: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function EditSupplierPriceListRowPriceModal({
  list,
  target,
  services,
  onSaved,
  onOutdated,
  onClose,
  onSessionEnded,
}: EditSupplierPriceListRowPriceModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState<SupplierPriceListRow | null>(null);
  const [notice, setNotice] = useState<SupplierPriceListChangeNotice | null>(null);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_ROW_PRICE_FORM,
    request: { schema: supplierPriceListRowPriceBodySchema, from: rowPriceRequestFrom },
    fields: ROW_PRICE_FIELDS,
    messages: ROW_PRICE_FIELD_MESSAGES,
    onSubmit: async (request, { showWireFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await services.setSupplierPriceListRowPrice(list.id, target.id, request);
      if (outcome.kind === "ok") {
        onSaved();
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
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      setNotice(supplierPriceListChangeNoticeOf(outcome));
    },
  });

  useEffect(() => {
    if (target) {
      reset(rowPriceFormValuesOf(target.priceCents, list.version));
      setShown(target);
      setNotice(null);
    }
  }, [target, list.version, reset]);

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
      icon={<Pencil />}
      context="Pedidos · Listas de proveedores"
      title={shown?.description ?? ""}
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
              size="large"
              icon={<Check />}
              fullWidth
              disabled={submitting}
              onPress={() => void submit()}
            >
              Guardar el precio
            </Button>
          )}
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          <SupplierPriceListChangeNotices notice={notice} failedTitle="No se guardó el precio" />
          <form.AppField name="price">
            {(field) => (
              <field.TextField
                kind="price"
                prefix="$"
                label="Precio"
                inputMode="decimal"
                required
              />
            )}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}
