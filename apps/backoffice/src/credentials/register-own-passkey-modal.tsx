import { passkeyRegistrationBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import type {
  RegistrationResponseJSON,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { KeyRound, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type {
  fetchPasskeyRegistrationChallenge,
  RegisterPasskeyOutcome,
  registerPasskey,
} from "./passkey-api";
import { passkeyNameMessage } from "./passkey-name-message";
import type { signalUnknownCredential } from "./signal-unknown-credential";

const PASSKEY_NAME_REQUEST = passkeyRegistrationBodySchema.pick({ passkey_name: true });

const PASSKEY_NAME_MESSAGE = passkeyNameMessage(passkeyRegistrationBodySchema.shape.passkey_name);

function isDefinitiveRejection(outcome: RegisterPasskeyOutcome): boolean {
  switch (outcome.kind) {
    case "validation_failed":
    case "unauthenticated":
    case "authorization_required":
    case "rate_limited":
      return true;
    case "ok":
    case "already_registered":
    case "failed":
      return false;
  }
}

export type RegisterOwnPasskeyModalServices = {
  fetchPasskeyRegistrationChallenge: typeof fetchPasskeyRegistrationChallenge;
  startRegistration: typeof startRegistration;
  registerPasskey: typeof registerPasskey;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
  signalUnknownCredential: typeof signalUnknownCredential;
};

export type RegisterOwnPasskeyModalProps = {
  open: boolean;
  onClose: () => void;
  onRegistered: () => void;
  onSessionEnded: () => void;
  services: RegisterOwnPasskeyModalServices;
};

// The cloud gates the registration-options fetch behind authorization, so this ceremony only ever
// runs once authorized.
export function RegisterOwnPasskeyModal({
  open,
  onClose,
  onRegistered,
  onSessionEnded,
  services,
}: RegisterOwnPasskeyModalProps) {
  const {
    fetchPasskeyRegistrationChallenge,
    startRegistration,
    registerPasskey,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
    signalUnknownCredential,
  } = services;
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const { run, modal } = useAuthorization<RegisterPasskeyOutcome>({
    actionName: "Agregar una passkey",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: { name: "" },
    request: {
      schema: PASSKEY_NAME_REQUEST,
      from: ({ name }) => ({ passkey_name: name.trim() }),
    },
    fields: { passkey_name: "name" },
    messages: { name: PASSKEY_NAME_MESSAGE },
    onSubmit: async ({ passkey_name }, { showWireFieldError }) => {
      setAttemptFailed(false);
      setRateLimitedSeconds(null);

      const outcome = await run(() => attemptRegistration(passkey_name));
      if (outcome.kind === "cancelled") {
        return;
      }
      if (outcome.kind === "ok") {
        onRegistered();
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onSessionEnded();
        return;
      }
      if (outcome.kind === "rate_limited") {
        setRateLimitedSeconds(outcome.retryAfterSeconds);
        return;
      }
      if (
        outcome.kind === "validation_failed" &&
        outcome.field !== undefined &&
        showWireFieldError(outcome.field)
      ) {
        return;
      }
      setAttemptFailed(true);
    },
  });

  useEffect(() => {
    if (open) {
      reset();
      setAttemptFailed(false);
      setRateLimitedSeconds(null);
    }
  }, [open, reset]);

  // Redone in full on a retry: the registration challenge shares its session-scoped row with the
  // authorization ceremony's own challenge, so options fetched before authorizing are gone after.
  async function attemptRegistration(passkeyName: string): Promise<RegisterPasskeyOutcome> {
    const challenge = await fetchPasskeyRegistrationChallenge();
    if (challenge.kind !== "ok") {
      return challenge;
    }
    const passkeyRegistration = await startRegistration({
      optionsJSON: challenge.value.registrationOptions,
    }).catch((): RegistrationResponseJSON | null => null);
    if (!passkeyRegistration) {
      return { kind: "failed" };
    }
    const outcome = await registerPasskey(passkeyRegistration, passkeyName);
    // Every definitive rejection but "already registered" means the credential was never saved,
    // so the device should forget it; an ambiguous outcome never signals, since it may have landed.
    if (isDefinitiveRejection(outcome)) {
      const rpId = challenge.value.registrationOptions.rp.id;
      if (rpId) {
        signalUnknownCredential({ rpId, credentialId: passkeyRegistration.id });
      }
    }
    return outcome;
  }

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
        icon={<KeyRound />}
        context="Mi cuenta · Passkeys"
        title="Registrar una passkey"
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
              icon={<KeyRound />}
              fullWidth
              disabled={submitting}
              onPress={() => void submit()}
            >
              Registrar la passkey
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {attemptFailed ? (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo registrar la passkey"
              description="Probá de nuevo."
            />
          ) : null}
          {rateLimitedSeconds !== null && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(rateLimitedSeconds)}
            />
          )}
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                kind="plain-text"
                label="Nombre de la passkey"
                description="Por ejemplo, Teléfono de Lucía."
                required
              />
            )}
          </form.AppField>
        </div>
      </Modal>
      {modal}
    </>
  );
}
