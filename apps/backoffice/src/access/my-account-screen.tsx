import { passkeyRegistrationBodySchema } from "@purosur/contracts";
import {
  Button,
  EmptyState,
  IconButton,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
} from "@purosur/ui";
import type {
  RegistrationResponseJSON,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { KeyRound, Laptop, Plus, ShieldX, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useCloudForm } from "../platform/cloud-form";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { useOwnPasskeysQuery, useRefreshAccess } from "./access-queries";
import { useAuthorization } from "./authorization-modal";
import type { MyAccountScreenServices } from "./my-account-services";
import type {
  fetchPasskeyRegistrationChallenge,
  Passkey,
  RegisterPasskeyOutcome,
  RemovePasskeyOutcome,
  registerPasskey,
  removePasskey,
} from "./passkey-api";
import { passkeyNameMessage } from "./passkey-name-message";
import { passkeyRowDetail } from "./passkey-row-detail";
import type { authorizeSession, fetchSessionAuthorizationOptions } from "./session-api";
import type { signalUnknownCredential } from "./signal-unknown-credential";

const PASSKEY_NAME_REQUEST = passkeyRegistrationBodySchema.pick({ passkey_name: true });

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

export type MyAccountScreenProps = {
  displayName: string;
  onSessionEnded: () => void;
  now?: () => Date;
  services: MyAccountScreenServices;
};

type RegisterPasskeyModalProps = {
  open: boolean;
  onClose: () => void;
  onRegistered: () => void;
  onSessionEnded: () => void;
  fetchPasskeyRegistrationChallenge: typeof fetchPasskeyRegistrationChallenge;
  startRegistration: typeof startRegistration;
  registerPasskey: typeof registerPasskey;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
  signalUnknownCredential: typeof signalUnknownCredential;
};

/** The cloud gates the registration-options fetch behind authorization, so this ceremony only ever runs once authorized. */
function RegisterPasskeyModal({
  open,
  onClose,
  onRegistered,
  onSessionEnded,
  fetchPasskeyRegistrationChallenge,
  startRegistration,
  registerPasskey,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
  signalUnknownCredential,
}: RegisterPasskeyModalProps) {
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const { run, modal } = useAuthorization<RegisterPasskeyOutcome>({
    actionName: "Agregar una passkey",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, reset } = useCloudForm({
    defaultValues: { name: "" },
    request: {
      schema: PASSKEY_NAME_REQUEST,
      from: ({ name }) => ({ passkey_name: name.trim() }),
    },
    fields: { passkey_name: "name" },
    messages: { name: passkeyNameMessage },
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

type RemovePasskeyModalProps = {
  target: Passkey | null;
  isOnlyPasskey: boolean;
  onClose: () => void;
  onRemoved: () => void;
  onSessionEnded: () => void;
  removePasskey: typeof removePasskey;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

function RemovePasskeyModal({
  target,
  isOnlyPasskey,
  onClose,
  onRemoved,
  onSessionEnded,
  removePasskey,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
}: RemovePasskeyModalProps) {
  const open = target !== null;
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<RemovePasskeyOutcome>({
    actionName: "Dar de baja una passkey",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (open) {
      setAttemptFailed(false);
      setRateLimitedSeconds(null);
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    if (!target) {
      return;
    }
    setAttemptFailed(false);
    setRateLimitedSeconds(null);
    setSubmitting(true);

    const outcome = await run(() => removePasskey(target.id));
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "ok" || outcome.kind === "not_found") {
      onRemoved();
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "rate_limited") {
      setRateLimitedSeconds(outcome.retryAfterSeconds);
      setSubmitting(false);
      return;
    }
    setAttemptFailed(true);
    setSubmitting(false);
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
        width="confirmation"
        tone="error"
        icon={<Trash2 />}
        title="¿Dar de baja la passkey?"
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
              destructive
              size="large"
              icon={<Trash2 />}
              fullWidth
              disabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Dar de baja
            </Button>
          </>
        }
      >
        {target ? (
          <div className="flex flex-col gap-4">
            <p className="text-body text-text">
              {`«${target.name}» deja de servir para entrar.`}
              {isOnlyPasskey
                ? " Es tu única passkey: para volver a entrar vas a tener que pedir el enlace de recuperación por correo."
                : ""}
            </p>
            {attemptFailed ? (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="No se pudo dar de baja la passkey"
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
          </div>
        ) : null}
      </Modal>
      {modal}
    </>
  );
}

const NO_PASSKEYS: Passkey[] = [];

export function MyAccountScreen({
  displayName,
  onSessionEnded,
  now,
  services,
}: MyAccountScreenProps) {
  const {
    fetchPasskeys,
    fetchPasskeyRegistrationChallenge,
    registerPasskey,
    removePasskey,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
    startRegistration,
    signalUnknownCredential,
  } = services;
  const data = useOwnPasskeysQuery({
    fetchPasskeys,
    now: now ?? (() => new Date()),
    onSessionEnded,
  });
  const refreshAccess = useRefreshAccess();
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Passkey | null>(null);

  const passkeys = data.status === "loaded" ? data.value.passkeys : NO_PASSKEYS;
  const isOnlyPasskey = passkeys.length === 1;
  const hasNoPasskeys = data.status === "loaded" && passkeys.length === 0;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 flex-col justify-center border-border border-b bg-surface px-8">
            <p className="text-text-subtle text-detail">{`Configuración · ${displayName}`}</p>
            <ScreenTitle>Mi cuenta</ScreenTitle>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 text-subheading text-text-accent">Passkeys</h2>
            <Button
              variant="secondary"
              icon={<Plus />}
              dataStatus={data.status}
              disabled={hasNoPasskeys}
              onPress={() => setRegisterModalOpen(true)}
            >
              Registrar otra passkey
            </Button>
          </div>
          {data.status === "loading" && <LoadingPlaceholder variant="list" items={2} />}
          {data.status === "failed" && <LoadFailure {...cloudLoadFailure(data, "tus passkeys")} />}
          {data.status === "loaded" &&
            (hasNoPasskeys ? (
              <EmptyState
                icon={<KeyRound />}
                title="No tenés ninguna passkey"
                description="Para volver a entrar al backoffice vas a tener que pedir el enlace de recuperación por correo."
                variant="blank"
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {passkeys.map((passkey) => (
                  <li key={passkey.id} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-icon-lg shrink-0 text-text-subtle"
                    >
                      <Laptop />
                    </span>
                    <div className="flex flex-1 flex-col gap-1">
                      <p className="font-semibold text-body text-text">{passkey.name}</p>
                      <p className="text-text-subtle text-detail">
                        {passkeyRowDetail(passkey, data.value.loadedAt)}
                      </p>
                    </div>
                    <IconButton
                      icon={<Trash2 />}
                      aria-label={`Dar de baja la passkey «${passkey.name}»`}
                      onPress={() => setRemoveTarget(passkey)}
                    />
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </ScreenLayout>
      <RegisterPasskeyModal
        open={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        onRegistered={() => {
          setRegisterModalOpen(false);
          void refreshAccess();
        }}
        onSessionEnded={onSessionEnded}
        fetchPasskeyRegistrationChallenge={fetchPasskeyRegistrationChallenge}
        startRegistration={startRegistration}
        registerPasskey={registerPasskey}
        fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
        authorizeSession={authorizeSession}
        startAuthentication={startAuthentication}
        signalUnknownCredential={signalUnknownCredential}
      />
      <RemovePasskeyModal
        target={removeTarget}
        isOnlyPasskey={isOnlyPasskey}
        onClose={() => setRemoveTarget(null)}
        onRemoved={() => {
          setRemoveTarget(null);
          void refreshAccess();
        }}
        onSessionEnded={onSessionEnded}
        removePasskey={removePasskey}
        fetchSessionAuthorizationOptions={fetchSessionAuthorizationOptions}
        authorizeSession={authorizeSession}
        startAuthentication={startAuthentication}
      />
    </>
  );
}
