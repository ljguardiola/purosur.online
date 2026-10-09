import { type SupplierSummary, supplierEditBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import { Check, Pencil, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type { SupplierReload } from "./purchasing-queries";
import {
  EMPTY_SUPPLIER_FORM,
  SUPPLIER_CUIT_TAKEN,
  SUPPLIER_FIELD_MESSAGES,
  SUPPLIER_FIELDS,
  SUPPLIER_NAME_TAKEN,
  supplierEditRequestFrom,
  supplierFormValuesOf,
} from "./supplier-form";
import type { editSupplier } from "./suppliers-api";

export type EditSupplierModalServices = {
  editSupplier: typeof editSupplier;
};

type EditSupplierModalProps = {
  target: SupplierSummary | null;
  onClose: () => void;
  onSaved: () => void;
  onSessionEnded: () => void;
  reload: (id: string) => Promise<SupplierReload>;
  services: EditSupplierModalServices;
};

type EditNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleVersion" }
  | { kind: "notFound" };

export function EditSupplierModal({
  target,
  onClose,
  onSaved,
  onSessionEnded,
  reload,
  services,
}: EditSupplierModalProps) {
  const { editSupplier } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [loaded, setLoaded] = useState<SupplierSummary | null>(null);
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_SUPPLIER_FORM,
    request: { schema: supplierEditBodySchema, from: supplierEditRequestFrom },
    fields: SUPPLIER_FIELDS,
    messages: SUPPLIER_FIELD_MESSAGES,
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await editSupplier(target.id, request);
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
      if (outcome.kind === "not_found") {
        setNotice({ kind: "notFound" });
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
      if (outcome.kind === "stale_version") {
        setNotice({ kind: "staleVersion" });
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

  function load(supplier: SupplierSummary) {
    reset(supplierFormValuesOf(supplier));
    setLoaded(supplier);
    setNotice(null);
  }

  useEffect(() => {
    if (open && target) {
      reset(supplierFormValuesOf(target));
      setLoaded(target);
      setNotice(null);
      setReloading(false);
    }
  }, [open, target, reset]);

  async function handleReload() {
    if (!target) {
      return;
    }
    setReloading(true);
    const outcome = await reload(target.id);
    if (outcome.kind === "found") {
      load(outcome.supplier);
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
    }
    setReloading(false);
  }

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
      context="Stock · Proveedores"
      title={loaded?.name ?? ""}
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
            disabled={submitting || reloading}
            onPress={() => void submit()}
          >
            Guardar los cambios
          </Button>
        </>
      }
    >
      {target ? (
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
          {notice?.kind === "staleVersion" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este proveedor cambió mientras lo editabas"
              description="Recargá sus datos y volvé a hacer el cambio."
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este proveedor ya no existe"
            />
          )}
          {notice?.kind === "staleVersion" ? (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              disabled={submitting || reloading}
              onPress={() => void handleReload()}
            >
              Recargar
            </Button>
          ) : null}
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
      ) : null}
    </Modal>
  );
}
