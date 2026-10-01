import { fiscalAddressEditBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, Landmark, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import {
  EMPTY_FISCAL_ADDRESS_FORM,
  fiscalAddressEditRequestFrom,
  fiscalAddressFormValuesFrom,
  fiscalAddressNameMessage,
  fiscalAddressStreetAddressMessage,
} from "./fiscal-address-form";
import type {
  EditFiscalAddressOutcome,
  editFiscalAddress,
  FiscalAddress,
} from "./fiscal-addresses-api";

export type EditFiscalAddressModalServices = {
  editFiscalAddress: typeof editFiscalAddress;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type ModalNotice =
  | { kind: "attemptFailed" }
  | { kind: "staleVersion" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

type EditFiscalAddressModalProps = {
  target: FiscalAddress | null;
  onClose: () => void;
  onSaved: (name: string) => void;
  reload: () => Promise<CloudReadOutcome<FiscalAddress[]>>;
  onSessionEnded: () => void;
  services: EditFiscalAddressModalServices;
};

export function EditFiscalAddressModal({
  target,
  onClose,
  onSaved,
  reload,
  onSessionEnded,
  services,
}: EditFiscalAddressModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const {
    editFiscalAddress,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const open = target !== null;
  const [seededFrom, setSeededFrom] = useState<FiscalAddress | null>(null);
  const [notice, setNotice] = useState<ModalNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const { run, modal } = useAuthorization<EditFiscalAddressOutcome>({
    actionName: "Guardar el domicilio fiscal",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, dirty, reset } = useRequestForm({
    defaultValues: EMPTY_FISCAL_ADDRESS_FORM,
    request: { schema: fiscalAddressEditBodySchema, from: fiscalAddressEditRequestFrom },
    fields: { name: "name", street_address: "streetAddress", version: null },
    messages: {
      name: fiscalAddressNameMessage,
      streetAddress: fiscalAddressStreetAddressMessage,
    },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      if (target === null) {
        return;
      }
      setNotice(null);
      const outcome = await run(() => editFiscalAddress(target.id, request));
      if (outcome.kind === "cancelled") {
        return;
      }
      if (outcome.kind === "ok") {
        await reload();
        onSaved(request.name);
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
        await reload();
        return;
      }
      if (outcome.kind === "name_taken") {
        showFieldError("name", "Ya hay un domicilio fiscal con ese nombre.");
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

  useEffect(() => {
    if (target === null) {
      if (seededFrom !== null) {
        reset();
        setSeededFrom(null);
      }
    } else if (target !== seededFrom && !dirty) {
      reset(fiscalAddressFormValuesFrom(target));
      setSeededFrom(target);
      setNotice(null);
    }
  }, [target, seededFrom, dirty, reset]);

  async function handleReload() {
    if (target === null) {
      return;
    }
    setReloading(true);
    const outcome = await reload();
    const reloaded =
      outcome.kind === "ok" ? outcome.value.find(({ id }) => id === target.id) : undefined;
    if (reloaded !== undefined) {
      reset(fiscalAddressFormValuesFrom(reloaded));
      setSeededFrom(reloaded);
      setNotice(null);
    }
    setReloading(false);
  }

  const busy = submitting || reloading;

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="standard"
        tone="info"
        icon={<Landmark />}
        context="Domicilios fiscales"
        title="Editar el domicilio fiscal"
        closable
        footer={
          <>
            <Button variant="secondary" size="large" icon={<X />} disabled={busy} onPress={onClose}>
              Cancelar
            </Button>
            {notice?.kind === "staleVersion" ? (
              <Button
                variant="primary"
                size="large"
                icon={<RotateCcw />}
                fullWidth
                disabled={busy}
                onPress={() => void handleReload()}
              >
                Recargar
              </Button>
            ) : (
              <Button
                variant="primary"
                size="large"
                icon={<Check />}
                fullWidth
                disabled={busy}
                onPress={() => void submit()}
              >
                Guardar los cambios
              </Button>
            )}
          </>
        }
      >
        {target ? (
          <div className="flex flex-col gap-4">
            {notice?.kind === "attemptFailed" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="No se pudo guardar el cambio"
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
            {notice?.kind === "staleVersion" && (
              <InlineNotice
                tone="error"
                icon={<RotateCcw />}
                title="El domicilio fiscal cambió mientras lo editabas"
                description="Recargá los datos y volvé a hacer el cambio."
              />
            )}
            <form.AppField name="name">
              {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
            </form.AppField>
            <form.AppField name="streetAddress">
              {(field) => <field.TextField kind="plain-text" label="Dirección" required />}
            </form.AppField>
          </div>
        ) : null}
      </Modal>
      {modal}
    </>
  );
}
