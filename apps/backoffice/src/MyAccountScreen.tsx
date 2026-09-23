import { Button, IconButton, InlineNotice, Modal, TextField } from "@purosur/ui";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { KeyRound, Laptop, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { messages } from "./messages";
import {
  fetchPasskeyRegistrationChallenge,
  fetchPasskeyRemovalChallenge,
  fetchPasskeys,
  type Passkey,
  registerPasskey,
  removePasskey,
} from "./passkeyApi";
import { validatePasskeyName } from "./passkeyName";

export type MyAccountScreenProps = {
  displayName: string;
  onSessionEnded: () => void;
  /** Injected in tests so "today" in a passkey's last-use detail is deterministic. */
  now?: () => Date;
};

type ListState =
  | { kind: "loading" }
  | { kind: "loadError" }
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
};

/** Registers another passkey for the signed-in account, reauthenticating with an existing one first (issue #169). */
function RegisterPasskeyModal({
  isOpen,
  onClose,
  onRegistered,
  onSessionEnded,
}: RegisterPasskeyModalProps) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setNameError(undefined);
      setAttemptFailed(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  // Fetched fresh on every attempt, right before it's used: a submitted attempt that actually
  // reached the cloud (a failed reauthentication or a rejected registration) already consumed its
  // one-time challenge there (passkeys-registration-route.ts's consumePendingPasskeyChallenge), so
  // reusing stored options across attempts would only work for the first one.
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
    setSubmitting(true);

    const challenge = await fetchPasskeyRegistrationChallenge();
    if (challenge.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (challenge.kind !== "ok") {
      setAttemptFailed(true);
      setSubmitting(false);
      return;
    }

    const reauthentication = await startAuthentication({
      optionsJSON: challenge.value.reauthenticationOptions,
    }).catch((): AuthenticationResponseJSON | null => null);
    if (!reauthentication) {
      setAttemptFailed(true);
      setSubmitting(false);
      return;
    }
    const passkeyRegistration = await startRegistration({
      optionsJSON: challenge.value.registrationOptions,
    }).catch((): RegistrationResponseJSON | null => null);
    if (!passkeyRegistration) {
      setAttemptFailed(true);
      setSubmitting(false);
      return;
    }

    const outcome = await registerPasskey(reauthentication, passkeyRegistration, name.trim());
    if (outcome.kind === "ok") {
      onRegistered();
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    setAttemptFailed(true);
    setSubmitting(false);
  }

  return (
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
        <TextField
          kind="plain-text"
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
  );
}

type RemovePasskeyModalProps = {
  target: Passkey | null;
  isOnlyPasskey: boolean;
  onClose: () => void;
  onRemoved: () => void;
  onSessionEnded: () => void;
};

/** Removes one of the signed-in account's own passkeys, reauthenticating with an existing one first (issue #169). */
function RemovePasskeyModal({
  target,
  isOnlyPasskey,
  onClose,
  onRemoved,
  onSessionEnded,
}: RemovePasskeyModalProps) {
  const isOpen = target !== null;
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAttemptFailed(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  // See RegisterPasskeyModal's handleSubmit: the removal challenge is consumed the same way
  // (passkeys-removal-route.ts), so every attempt fetches its own fresh one.
  async function handleConfirm() {
    if (!target) {
      return;
    }
    setAttemptFailed(false);
    setSubmitting(true);

    const challenge = await fetchPasskeyRemovalChallenge();
    if (challenge.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (challenge.kind !== "ok") {
      setAttemptFailed(true);
      setSubmitting(false);
      return;
    }

    const reauthentication = await startAuthentication({
      optionsJSON: challenge.value.reauthenticationOptions,
    }).catch((): AuthenticationResponseJSON | null => null);
    if (!reauthentication) {
      setAttemptFailed(true);
      setSubmitting(false);
      return;
    }

    const outcome = await removePasskey(target.id, reauthentication);
    // A 404 means the passkey is already gone, which is exactly what removing it asked for.
    if (outcome.kind === "ok" || outcome.kind === "not_found") {
      onRemoved();
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    setAttemptFailed(true);
    setSubmitting(false);
  }

  return (
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
        </div>
      )}
    </Modal>
  );
}

/** "Mi cuenta": the signed-in account's own Passkeys section, for Shell's children slot (issue #169). */
export function MyAccountScreen({ displayName, onSessionEnded, now }: MyAccountScreenProps) {
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
    } else {
      setList({ kind: "loadError" });
    }
  }, [onSessionEnded]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshList() {
    const outcome = await fetchPasskeys();
    if (outcome.kind === "ok") {
      setList({ kind: "loaded", passkeys: outcome.value });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else {
      setList({ kind: "loadError" });
    }
  }

  const passkeys = list.kind === "loaded" ? list.passkeys : [];
  const isOnlyPasskey = passkeys.length === 1;
  const hasNoPasskeys = list.kind === "loaded" && passkeys.length === 0;

  return (
    <>
      <div className="flex h-18 shrink-0 flex-col justify-center border-line border-b bg-surface-white px-8">
        <p className="text-ink-secondary text-sm">
          {messages.settings.myAccount.breadcrumb({ name: displayName })}
        </p>
        <h1 className="font-bold text-2xl text-brand-blue-strong">
          {messages.settings.myAccount.heading}
        </h1>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-white p-4">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 font-bold text-lg text-brand-blue-strong">
              {passkeysMessages.title}
            </h2>
            <Button
              variant="secondary"
              icon={<Plus />}
              isDisabled={hasNoPasskeys}
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
          {list.kind === "loaded" && (
            <>
              {isOnlyPasskey && (
                <InlineNotice
                  tone="warning"
                  icon={<TriangleAlert />}
                  detail={passkeysMessages.singlePasskeyWarning}
                />
              )}
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
      </div>
      <RegisterPasskeyModal
        isOpen={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        onRegistered={() => {
          setRegisterModalOpen(false);
          void refreshList();
        }}
        onSessionEnded={onSessionEnded}
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
      />
    </>
  );
}
