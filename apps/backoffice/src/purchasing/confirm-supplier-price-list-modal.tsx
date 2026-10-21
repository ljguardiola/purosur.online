import { supplierPriceListConfirmationBodySchema } from "@purosur/contracts";
import { Button, Modal, useRequestForm } from "@purosur/ui";
import { Check, CircleCheck, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  type SupplierPriceListChangeNotice,
  SupplierPriceListChangeNotices,
  supplierPriceListChangeNoticeOf,
  supplierPriceListChangeOutdates,
} from "./supplier-price-list-change-notice";
import {
  CONFIRMATION_FIELD_MESSAGES,
  CONFIRMATION_FIELDS,
  confirmationFormValuesOf,
  confirmationRequestFrom,
  PRICES_INCLUDE_VAT_OPTIONS,
} from "./supplier-price-list-confirmation-form";
import type {
  confirmSupplierPriceList,
  SupplierPriceListReviewList,
} from "./supplier-price-lists-api";

export type ConfirmSupplierPriceListModalServices = {
  confirmSupplierPriceList: typeof confirmSupplierPriceList;
};

type ConfirmSupplierPriceListModalProps = {
  target: SupplierPriceListReviewList | null;
  services: ConfirmSupplierPriceListModalServices;
  onConfirmed: () => void;
  onOutdated: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function ConfirmSupplierPriceListModal({
  target,
  services,
  onConfirmed,
  onOutdated,
  onClose,
  onSessionEnded,
}: ConfirmSupplierPriceListModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<SupplierPriceListChangeNotice | null>(null);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: confirmationFormValuesOf(null, null, 1),
    request: { schema: supplierPriceListConfirmationBodySchema, from: confirmationRequestFrom },
    fields: CONFIRMATION_FIELDS,
    messages: CONFIRMATION_FIELD_MESSAGES,
    onSubmit: async (request, { showWireFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await services.confirmSupplierPriceList(target.id, request);
      if (outcome.kind === "ok") {
        onConfirmed();
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
      if (
        (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) ||
        (outcome.kind === "list_date_missing" && showWireFieldError("listDate")) ||
        (outcome.kind === "vat_missing" && showWireFieldError("pricesIncludeVat"))
      ) {
        return;
      }
      setNotice(supplierPriceListChangeNoticeOf(outcome));
    },
  });

  useEffect(() => {
    if (target) {
      reset(confirmationFormValuesOf(target.listDate, target.pricesIncludeVat, target.version));
      setTitle(`¿Confirmar la lista de ${target.supplier.name}?`);
      setNotice(null);
    }
  }, [target, reset]);

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
      icon={<CircleCheck />}
      context="Pedidos · Listas de proveedores"
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
              size="large"
              icon={<Check />}
              fullWidth
              disabled={submitting}
              onPress={() => void submit()}
            >
              Confirmar la lista
            </Button>
          )}
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          <SupplierPriceListChangeNotices notice={notice} failedTitle="No se confirmó la lista" />
          <p className="text-body text-text">
            Los precios se guardan tal como figuran en la lista.
          </p>
          <form.AppField name="date">
            {(field) => <field.DateField label="Fecha de la lista" required />}
          </form.AppField>
          <form.AppField name="pricesIncludeVat">
            {(field) => (
              <field.Select
                label="Los precios"
                placeholder="Elegí una opción"
                options={PRICES_INCLUDE_VAT_OPTIONS}
                required
              />
            )}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}
