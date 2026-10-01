import { registerCreationBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, Laptop, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthorization } from "../access/authorization-modal";
import { useSendToMyAccount } from "../access/send-to-my-account";
import type { authorizeSession, fetchSessionAuthorizationOptions } from "../access/session-api";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { registerNameMessage } from "./register-name-message";
import type { CreateRegisterOutcome, createRegister } from "./registers-api";

export type NewRegisterModalServices = {
  createRegister: typeof createRegister;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type NewRegisterModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onSessionEnded: () => void;
  services: NewRegisterModalServices;
};

export function NewRegisterModal({
  open,
  onClose,
  onCreated,
  onSessionEnded,
  services,
}: NewRegisterModalProps) {
  const {
    createRegister,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<
    { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number } | null
  >(null);
  const { run, modal } = useAuthorization<CreateRegisterOutcome>({
    actionName: "Crear una caja",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: { name: "" },
    request: { schema: registerCreationBodySchema, from: ({ name }) => ({ name }) },
    fields: { name: "name" },
    messages: { name: registerNameMessage },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      setNotice(null);
      const outcome = await run(() => createRegister(request));
      if (outcome.kind === "cancelled") {
        return;
      }
      if (outcome.kind === "ok") {
        onCreated();
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
        showFieldError("name", "Ya existe una caja con este nombre.");
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
        icon={<Laptop />}
        context="Configuración"
        title="Nueva caja"
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
              Crear la caja
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo crear la caja"
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
            {(field) => <field.TextField kind="plain-text" label="Nombre de la caja" required />}
          </form.AppField>
        </div>
      </Modal>
      {modal}
    </>
  );
}
