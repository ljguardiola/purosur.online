import { Button, IconButton, InlineNotice, Modal, TextField } from "@purosur/ui";
import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { KeyRound, Laptop, Plus, ShieldX, Trash2, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuthorization } from "./AuthorizationModal";
import { messages } from "./messages";
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
import { ScreenLayout } from "./ScreenLayout";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./sessionApi";
import { signalUnknownCredential } from "./signalUnknownCredential";

// An explicit allowlist instead of excluding "ok"/"already_registered"/"failed": a future outcome
// kind the exclusion list doesn't know about would otherwise signal by default. The exhaustive
// switch (no default case) makes the compiler refuse a kind this doesn't decide for.
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
  /** Injected in tests so "today" in a passkey's last-use detail is deterministic. */
  now?: () => Date;
  /** Injected in tests so passkey management doesn't call the real API or WebAuthn. */
  services?: MyAccountScreenServices;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; passkeys: Passkey[] };

const passkeysMessages = messages.settings.myAccount.passkeys;
const registerMessages = passkeysMessages.register;
const removeMessages = passkeysMessages.removeModal;

function passkeyRowDetail(passkey: Passkey, now: Date): string {
  return passkeysMessages.rowDetail({
    registeredOn: new Date(passkey.createdAt),
    ...(passkey.lastUsedAt ? { lastUsedAt: new Date(passkey.lastUsedAt) } : {}),
    now,
  });
}

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

/**
 * Registers another passkey for the signed-in account, confirming with the shared
 * passkey-authorization modal only when the cloud asks for it. The cloud asks already on the
 * registration options, so the creation ceremony runs only once the session is authorized, and
 * exactly once per registration.
 */
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
    action: "passkeyRegistration",
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

  // The whole options → creation ceremony → POST /users/passkeys attempt, redone in full on a
  // retry: the registration challenge shares its session-scoped row with the authorization
  // ceremony's own challenge, so options fetched before authorizing are gone afterwards.
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
    // The device just created this credential; every definitive rejection but "already
    // registered" (the cloud already knows it) means the cloud never saved it, so the device
    // should forget it. A network throw or an unrecognized status ("failed") is ambiguous — the
    // save may have landed — and never signals.
    if (isDefinitiveRejection(outcome)) {
      const rpId = challenge.value.registrationOptions.rp.id;
      if (rpId) {
        signalUnknownCredential({ rpId, credentialId: passkeyRegistration.id });
      }
    }
    return outcome;
  }

  async function handleSubmit() {
    const validationError = validatePasskeyName(name, {
      required: registerMessages.nameRequired,
      tooLong: registerMessages.nameTooLong,
    });
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
        context={registerMessages.eyebrow}
        title={registerMessages.heading}
        closable
        closeLabel={registerMessages.closeLabel}
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              isDisabled={submitting}
              onPress={onClose}
            >
              {registerMessages.cancel}
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<KeyRound />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleSubmit()}
            >
              {registerMessages.submit}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {attemptFailed && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={registerMessages.attemptFailedTitle}
              detail={registerMessages.attemptFailedDetail}
            />
          )}
          {rateLimitedSeconds !== null && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={registerMessages.rateLimitedTitle}
              detail={registerMessages.rateLimitedDetail({
                minutes: Math.ceil(rateLimitedSeconds / 60),
              })}
            />
          )}
          <TextField
            kind="plain-text"
            variant="backoffice"
            label={registerMessages.nameLabel}
            value={name}
            onChange={(value) => {
              setName(value);
              if (nameError) {
                setNameError(
                  validatePasskeyName(value, {
                    required: registerMessages.nameRequired,
                    tooLong: registerMessages.nameTooLong,
                  }),
                );
              }
            }}
            helperText={registerMessages.nameHelper}
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

/** Removes one of the signed-in account's own passkeys, confirming with the shared passkey-authorization modal only when the cloud asks for it. */
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
    action: "passkeyRemoval",
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
    // A 404 means the passkey is already gone, which is exactly what removing it asked for.
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
        title={removeMessages.title}
        closable
        closeLabel={removeMessages.closeLabel}
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              isDisabled={submitting}
              onPress={onClose}
            >
              {removeMessages.cancel}
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
              {removeMessages.confirm}
            </Button>
          </>
        }
      >
        {target && (
          <div className="flex flex-col gap-4">
            <p className="text-base text-ink">
              {removeMessages.body({ name: target.name })}
              {isOnlyPasskey ? ` ${removeMessages.onlyPasskeyWarning}` : ""}
            </p>
            {attemptFailed && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title={removeMessages.attemptFailedTitle}
                detail={removeMessages.attemptFailedDetail}
              />
            )}
            {rateLimitedSeconds !== null && (
              <InlineNotice
                tone="error"
                icon={<ShieldX />}
                title={removeMessages.rateLimitedTitle}
                detail={removeMessages.rateLimitedDetail({
                  minutes: Math.ceil(rateLimitedSeconds / 60),
                })}
              />
            )}
          </div>
        )}
      </Modal>
      {modal}
    </>
  );
}

/** "Mi cuenta": the signed-in account's own Passkeys section, for Shell's children slot. */
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
            <p className="text-ink-secondary text-sm">
              {messages.settings.myAccount.breadcrumb({ name: displayName })}
            </p>
            <h1 className="font-bold text-2xl text-brand-blue-strong">
              {messages.settings.myAccount.heading}
            </h1>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-white p-4">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 font-bold text-lg text-brand-blue-strong">
              {passkeysMessages.title}
            </h2>
            <Button
              variant="secondary"
              icon={<Plus />}
              isDisabled={list.kind === "loading" || hasNoPasskeys}
              onPress={() => setRegisterModalOpen(true)}
            >
              {passkeysMessages.registerAnother}
            </Button>
          </div>
          {list.kind === "loading" && <p role="status">{passkeysMessages.loading}</p>}
          {list.kind === "loadError" && (
            <>
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title={passkeysMessages.loadErrorTitle}
                detail={passkeysMessages.loadErrorDetail}
              />
              <Button variant="secondary" onPress={() => void load()}>
                {passkeysMessages.retry}
              </Button>
            </>
          )}
          {list.kind === "rate_limited" && (
            <>
              <InlineNotice
                tone="error"
                icon={<ShieldX />}
                title={passkeysMessages.rateLimitedTitle}
                detail={passkeysMessages.rateLimitedDetail({
                  minutes: Math.ceil(list.retryAfterSeconds / 60),
                })}
              />
              <Button variant="secondary" onPress={() => void load()}>
                {passkeysMessages.retry}
              </Button>
            </>
          )}
          {list.kind === "loaded" && (
            <>
              {hasNoPasskeys && (
                <InlineNotice
                  tone="warning"
                  icon={<TriangleAlert />}
                  detail={passkeysMessages.noPasskeysWarning}
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
                      aria-label={passkeysMessages.remove({ name: passkey.name })}
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
