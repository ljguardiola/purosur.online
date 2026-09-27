import { Button, IconButton, InlineNotice, Modal, TextField } from "@purosur/ui";
import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { KeyRound, Laptop, Plus, ShieldX, Trash2, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuthorization } from "./AuthorizationModal";
import {
  fetchPasskeyRegistrationChallenge,
  fetchPasskeys,
  type Passkey,
  type RegisterPasskeyOutcome,
  type RemovePasskeyOutcome,
  registerPasskey,
  removePasskey,
} from "./passkeyApi";
import { validatePasskeyName } from "./passkeyName";
import { passkeyRowDetail } from "./passkeyRowDetail";
import { retryAfterDetail } from "./retryAfterDetail";
import { ScreenLayout } from "./ScreenLayout";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./sessionApi";
import { signalUnknownCredential } from "./signalUnknownCredential";

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

export type MyAccountScreenServices = {
  fetchPasskeys: typeof fetchPasskeys;
  fetchPasskeyRegistrationChallenge: typeof fetchPasskeyRegistrationChallenge;
  registerPasskey: typeof registerPasskey;
  removePasskey: typeof removePasskey;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
  startRegistration: typeof startRegistration;
  signalUnknownCredential: typeof signalUnknownCredential;
};

export const defaultMyAccountScreenServices: MyAccountScreenServices = {
  fetchPasskeys,
  fetchPasskeyRegistrationChallenge,
  registerPasskey,
  removePasskey,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
  startRegistration,
  signalUnknownCredential,
};

export type MyAccountScreenProps = {
  displayName: string;
  onSessionEnded: () => void;
  now?: () => Date;
  services?: MyAccountScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; passkeys: Passkey[] };

const CANCEL_LABEL = "Cancelar";
const RATE_LIMITED_TITLE = "Demasiadas solicitudes";
const ATTEMPT_FAILED_DETAIL = "Probá de nuevo.";
const RETRY_LABEL = "Reintentar";

type RegisterPasskeyModalProps = {
  isOpen: boolean;
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
  isOpen,
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
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<RegisterPasskeyOutcome>({
    actionName: "Agregar una passkey",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (isOpen) {
      setName("");
      setNameError(undefined);
      setAttemptFailed(false);
      setRateLimitedSeconds(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  // Redone in full on a retry: the registration challenge shares its session-scoped row with the
  // authorization ceremony's own challenge, so options fetched before authorizing are gone after.
  async function attemptRegistration(trimmedName: string): Promise<RegisterPasskeyOutcome> {
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
    const outcome = await registerPasskey(passkeyRegistration, trimmedName);
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

  async function handleSubmit() {
    const validationError = validatePasskeyName(name);
    setNameError(validationError);
    if (validationError) {
      return;
    }
    setAttemptFailed(false);
    setRateLimitedSeconds(null);
    setSubmitting(true);

    const trimmedName = name.trim();
    const outcome = await run(() => attemptRegistration(trimmedName));
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
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
      setSubmitting(false);
      return;
    }
    setAttemptFailed(true);
    setSubmitting(false);
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
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
              isDisabled={submitting}
              onPress={onClose}
            >
              {CANCEL_LABEL}
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<KeyRound />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleSubmit()}
            >
              Registrar la passkey
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {attemptFailed && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo registrar la passkey"
              detail={ATTEMPT_FAILED_DETAIL}
            />
          )}
          {rateLimitedSeconds !== null && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={RATE_LIMITED_TITLE}
              detail={retryAfterDetail(rateLimitedSeconds)}
            />
          )}
          <TextField
            kind="plain-text"
            label="Nombre de la passkey"
            value={name}
            onChange={(value) => {
              setName(value);
              if (nameError) {
                setNameError(validatePasskeyName(value));
              }
            }}
            helperText="Por ejemplo, Teléfono de Lucía."
            required
            {...(nameError ? { invalid: true, errorMessage: nameError } : {})}
          />
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
  const isOpen = target !== null;
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [rateLimitedSeconds, setRateLimitedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<RemovePasskeyOutcome>({
    actionName: "Dar de baja una passkey",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (isOpen) {
      setAttemptFailed(false);
      setRateLimitedSeconds(null);
      setSubmitting(false);
    }
  }, [isOpen]);

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
        isOpen={isOpen}
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
              isDisabled={submitting}
              onPress={onClose}
            >
              {CANCEL_LABEL}
            </Button>
            <Button
              variant="primary"
              tone="destructive"
              size="large"
              icon={<Trash2 />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleConfirm()}
            >
              Dar de baja
            </Button>
          </>
        }
      >
        {target && (
          <div className="flex flex-col gap-4">
            <p className="text-base text-ink">
              {`«${target.name}» deja de servir para entrar.`}
              {isOnlyPasskey
                ? " Es tu única passkey: para volver a entrar vas a tener que pedir el enlace de recuperación por correo."
                : ""}
            </p>
            {attemptFailed && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="No se pudo dar de baja la passkey"
                detail={ATTEMPT_FAILED_DETAIL}
              />
            )}
            {rateLimitedSeconds !== null && (
              <InlineNotice
                tone="error"
                icon={<ShieldX />}
                title={RATE_LIMITED_TITLE}
                detail={retryAfterDetail(rateLimitedSeconds)}
              />
            )}
          </div>
        )}
      </Modal>
      {modal}
    </>
  );
}

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
  } = services ?? defaultMyAccountScreenServices;
  const clock = now ?? (() => new Date());
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Passkey | null>(null);

  const load = useCallback(async () => {
    setList({ kind: "loading" });
    const outcome = await fetchPasskeys();
    if (outcome.kind === "ok") {
      setList({ kind: "loaded", passkeys: outcome.value });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "rate_limited") {
      setList({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setList({ kind: "loadError" });
    }
  }, [onSessionEnded, fetchPasskeys]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshList() {
    const outcome = await fetchPasskeys();
    if (outcome.kind === "ok") {
      setList({ kind: "loaded", passkeys: outcome.value });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "rate_limited") {
      setList({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setList({ kind: "loadError" });
    }
  }

  const passkeys = list.kind === "loaded" ? list.passkeys : [];
  const isOnlyPasskey = passkeys.length === 1;
  const hasNoPasskeys = list.kind === "loaded" && passkeys.length === 0;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 flex-col justify-center border-line border-b bg-surface-white px-8">
            <p className="text-ink-secondary text-sm">{`Configuración · ${displayName}`}</p>
            <h1 className="font-bold text-2xl text-brand-blue-strong">Mi cuenta</h1>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-white p-4">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 font-bold text-lg text-brand-blue-strong">Passkeys</h2>
            <Button
              variant="secondary"
              icon={<Plus />}
              isDisabled={list.kind === "loading" || hasNoPasskeys}
              onPress={() => setRegisterModalOpen(true)}
            >
              Registrar otra passkey
            </Button>
          </div>
          {list.kind === "loading" && <p role="status">Cargando tus passkeys…</p>}
          {list.kind === "loadError" && (
            <>
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="No pudimos abrir tus passkeys"
                detail="Probá de nuevo en unos minutos."
              />
              <Button variant="secondary" onPress={() => void load()}>
                {RETRY_LABEL}
              </Button>
            </>
          )}
          {list.kind === "rate_limited" && (
            <>
              <InlineNotice
                tone="error"
                icon={<ShieldX />}
                title={RATE_LIMITED_TITLE}
                detail={retryAfterDetail(list.retryAfterSeconds)}
              />
              <Button variant="secondary" onPress={() => void load()}>
                {RETRY_LABEL}
              </Button>
            </>
          )}
          {list.kind === "loaded" && (
            <>
              {hasNoPasskeys && (
                <InlineNotice
                  tone="warning"
                  icon={<TriangleAlert />}
                  detail="No tenés ninguna passkey. Para volver a entrar al backoffice vas a tener que pedir el enlace de recuperación por correo."
                />
              )}
              <ul className="flex flex-col gap-2">
                {passkeys.map((passkey) => (
                  <li key={passkey.id} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-5 shrink-0 text-ink-secondary"
                    >
                      <Laptop />
                    </span>
                    <div className="flex flex-1 flex-col gap-1">
                      <p className="font-semibold text-base text-ink">{passkey.name}</p>
                      <p className="text-ink-secondary text-sm">
                        {passkeyRowDetail(passkey, clock())}
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
            </>
          )}
        </div>
      </ScreenLayout>
      <RegisterPasskeyModal
        isOpen={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        onRegistered={() => {
          setRegisterModalOpen(false);
          void refreshList();
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
          void refreshList();
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
