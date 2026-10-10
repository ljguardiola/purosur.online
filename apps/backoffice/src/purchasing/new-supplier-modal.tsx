import { type SupplierSummary, supplierCreationBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import { Check, ShieldX, TriangleAlert, Truck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  EMPTY_SUPPLIER_FORM,
  SUPPLIER_CUIT_TAKEN,
  SUPPLIER_FIELD_MESSAGES,
  SUPPLIER_FIELDS,
  SUPPLIER_NAME_TAKEN,
  supplierCreationRequestFrom,
} from "./supplier-form";
import type { createSupplier } from "./suppliers-api";

export type NewSupplierModalServices = {
  createSupplier: typeof createSupplier;
};

type NewSupplierModalProps = {
  open: boolean;
  services: NewSupplierModalServices;
  onCreated: (supplier: SupplierSummary) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

type Notice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

export function NewSupplierModal({
  open,
  services,
  onCreated,
  onClose,
  onSessionEnded,
}: NewSupplierModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<Notice | null>(null);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_SUPPLIER_FORM,
    request: { schema: supplierCreationBodySchema, from: supplierCreationRequestFrom },
    fields: SUPPLIER_FIELDS,
    messages: SUPPLIER_FIELD_MESSAGES,
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      setNotice(null);
      const outcome = await services.createSupplier(request);
      if (outcome.kind === "ok") {
        onCreated(outcome.supplier);
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
      if (outcome.kind === "name_taken") {
        showFieldError("name", SUPPLIER_NAME_TAKEN);
        return;
      }
      if (outcome.kind === "cuit_taken") {
        showFieldError("cuit", SUPPLIER_CUIT_TAKEN);
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  useEffect(() => {
    if (open) {
      reset();
      setNotice(null);
    }
  }, [open, reset]);

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
      icon={<Truck />}
      context="Stock · Proveedores"
      title="Nuevo proveedor"
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
            size="large"
            icon={<Check />}
            fullWidth
            disabled={submitting}
            onPress={() => void submit()}
          >
            Crear el proveedor
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se guardó el proveedor"
            description="Volvé a intentarlo."
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
        <form.AppField name="name">
          {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
        </form.AppField>
        <form.AppField name="cuit">
          {(field) => <field.TextField kind="plain-text" label="CUIT" />}
        </form.AppField>
        <form.AppField name="contact">
          {(field) => <field.TextField kind="plain-text" label="Contacto" />}
        </form.AppField>
        <form.AppField name="note">
          {(field) => <field.TextField kind="plain-text" label="Nota" />}
        </form.AppField>
      </div>
    </Modal>
  );
}
