import { fiscalAddressCreationBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, Landmark, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import {
  EMPTY_FISCAL_ADDRESS_FORM,
  fiscalAddressCreationRequestFrom,
  fiscalAddressNameMessage,
  fiscalAddressStreetAddressMessage,
} from "./fiscal-address-form";
import type { CreateFiscalAddressOutcome, createFiscalAddress } from "./fiscal-addresses-api";

export type NewFiscalAddressModalServices = {
  createFiscalAddress: typeof createFiscalAddress;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type NewFiscalAddressModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
  onSessionEnded: () => void;
  services: NewFiscalAddressModalServices;
};

export function NewFiscalAddressModal({
  open,
  onClose,
  onCreated,
  onSessionEnded,
  services,
}: NewFiscalAddressModalProps) {
  const {
    createFiscalAddress,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<
    { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number } | null
  >(null);
  const { run, modal } = useAuthorization<CreateFiscalAddressOutcome>({
    actionName: "Crear un domicilio fiscal",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_FISCAL_ADDRESS_FORM,
    request: {
      schema: fiscalAddressCreationBodySchema,
      from: fiscalAddressCreationRequestFrom,
    },
    fields: { name: "name", street_address: "streetAddress" },
    messages: {
      name: fiscalAddressNameMessage,
      streetAddress: fiscalAddressStreetAddressMessage,
    },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      setNotice(null);
      const outcome = await run(() => createFiscalAddress(request));
      if (outcome.kind === "cancelled") {
        return;
      }
      if (outcome.kind === "ok") {
        onCreated(request.name);
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
        showFieldError("name", "Ya hay un domicilio fiscal con ese nombre.");
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
        title="Nuevo domicilio fiscal"
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
              Crear el domicilio fiscal
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo crear el domicilio fiscal"
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
          <form.AppField name="name">
            {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
          </form.AppField>
          <form.AppField name="streetAddress">
            {(field) => <field.TextField kind="plain-text" label="Dirección" required />}
          </form.AppField>
        </div>
      </Modal>
      {modal}
    </>
  );
}
