import { type PackagingSummary, packagingEditBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, TextField, useRequestForm } from "@purosur/ui";
import { Check, Pencil, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { quantityFieldKind } from "../platform/stock-quantity";
import {
  EMPTY_PACKAGING_FORM,
  PACKAGING_EDIT_FIELDS,
  PACKAGING_NAME_TAKEN,
  packagingEditRequestFrom,
  packagingFormValuesOf,
  packagingNameMessage,
  packagingQuantityMessage,
} from "./packaging-form";
import type { editPackaging } from "./packagings-api";
import type { PackagingReload } from "./purchasing-queries";

export type EditPackagingModalServices = {
  editPackaging: typeof editPackaging;
};

type EditPackagingModalProps = {
  target: PackagingSummary | null;
  onClose: () => void;
  onSaved: () => void;
  onSessionEnded: () => void;
  reload: (id: string) => Promise<PackagingReload>;
  services: EditPackagingModalServices;
};

type EditNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleVersion" }
  | { kind: "notFound" };

export function EditPackagingModal({
  target,
  onClose,
  onSaved,
  onSessionEnded,
  reload,
  services,
}: EditPackagingModalProps) {
  const { editPackaging } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [loaded, setLoaded] = useState<PackagingSummary | null>(null);
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const saleUnit = (loaded ?? target)?.productSaleUnit ?? "UNIT";
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_PACKAGING_FORM,
    request: {
      schema: packagingEditBodySchema,
      from: (values) => packagingEditRequestFrom(values, saleUnit),
    },
    fields: PACKAGING_EDIT_FIELDS,
    messages: {
      name: packagingNameMessage,
      quantity: (values) => packagingQuantityMessage(values, saleUnit),
    },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await editPackaging(target.id, request);
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
        showFieldError("name", PACKAGING_NAME_TAKEN);
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

  function load(packaging: PackagingSummary) {
    reset(packagingFormValuesOf(packaging));
    setLoaded(packaging);
    setNotice(null);
  }

  useEffect(() => {
    if (open && target) {
      reset(packagingFormValuesOf(target));
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
      load(outcome.packaging);
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
      context="Stock · Presentaciones de compra"
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
              title="No se guardó la presentación"
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
              title="Esta presentación cambió mientras la editabas"
              description="Recargá sus datos y volvé a hacer el cambio."
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Esta presentación ya no existe"
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
          <TextField
            kind="plain-text"
            label="Producto"
            value={(loaded ?? target).productName}
            onChange={() => {}}
            readOnly
            readOnlyReason="Una presentación pertenece siempre al mismo producto."
          />
          <form.AppField name="name">
            {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
          </form.AppField>
          <form.AppField name="quantity">
            {(field) => (
              <field.TextField
                {...quantityFieldKind(saleUnit)}
                label="Cantidad por presentación"
                required
              />
            )}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}
