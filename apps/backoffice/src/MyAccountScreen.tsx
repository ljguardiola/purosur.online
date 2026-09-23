import { Button, IconButton, InlineNotice, Modal, TextField } from "@purosur/ui";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
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

type RegistrationChallenge = {
  reauthenticationOptions: PublicKeyCredentialRequestOptionsJSON;
  registrationOptions: PublicKeyCredentialCreationOptionsJSON;
};

type RegisterReadyPhase = {
  kind: "ready";
  challenge: RegistrationChallenge;
  attemptFailed: boolean;
  submitting: boolean;
};

type RegisterModalPhase = { kind: "loading" } | { kind: "loadError" } | RegisterReadyPhase;

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
  const [phase, setPhase] = useState<RegisterModalPhase>({ kind: "loading" });
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setPhase({ kind: "loading" });
    const outcome = await fetchPasskeyRegistrationChallenge();
    if (outcome.kind === "ok") {
      setPhase({
        kind: "ready",
        challenge: outcome.value,
        attemptFailed: false,
        submitting: false,
      });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else {
      setPhase({ kind: "loadError" });
    }
  }, [onSessionEnded]);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setNameError(undefined);
      void load();
    }
  }, [isOpen, load]);

  // Any submitted attempt that actually reached the cloud (a failed reauthentication or a
  // rejected registration) already consumed its one-time challenge there
  // (passkeys-registration-route.ts's consumePendingPasskeyChallenge), so a retry needs fresh
  // options. A browser-cancelled prompt never reaches the cloud, so the current options stay
  // valid and are kept as-is.
  async function refreshAfterRejectedAttempt() {
    setPhase({ kind: "loading" });
    const outcome = await fetchPasskeyRegistrationChallenge();
    if (outcome.kind === "ok") {
      setPhase({ kind: "ready", challenge: outcome.value, attemptFailed: true, submitting: false });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else {
      setPhase({ kind: "loadError" });
    }
  }

  async function handleSubmit(readyPhase: RegisterReadyPhase) {
    const validationError = validatePasskeyName(name, {
      required: registerMessages.nameRequired,
      tooLong: registerMessages.nameTooLong,
    });
    setNameError(validationError);
    if (validationError) {
      return;
    }
    setPhase({ ...readyPhase, attemptFailed: false, submitting: true });

    const reauthentication = await startAuthentication({
      optionsJSON: readyPhase.challenge.reauthenticationOptions,
    }).catch((): AuthenticationResponseJSON | null => null);
    if (!reauthentication) {
      setPhase({ ...readyPhase, attemptFailed: true, submitting: false });
      return;
    }
    const passkeyRegistration = await startRegistration({
      optionsJSON: readyPhase.challenge.registrationOptions,
    }).catch((): RegistrationResponseJSON | null => null);
    if (!passkeyRegistration) {
      setPhase({ ...readyPhase, attemptFailed: true, submitting: false });
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
    await refreshAfterRejectedAttempt();
  }

  const ready = phase.kind === "ready" ? phase : undefined;

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
            isDisabled={ready ? ready.submitting : false}
            onPress={onClose}
          >
            {registerMessages.cancel}
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<KeyRound />}
            fullWidth
            isDisabled={!ready || ready.submitting}
            onPress={() => ready && void handleSubmit(ready)}
          >
            {registerMessages.submit}
          </Button>
        </>
      }
    >
      {phase.kind === "loading" && <p role="status">{passkeysMessages.loading}</p>}
      {phase.kind === "loadError" && (
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
      {ready && (
        <div className="flex flex-col gap-4">
          {ready.attemptFailed && (
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
      )}
    </Modal>
  );
}

type RemovalChallenge = { reauthenticationOptions: PublicKeyCredentialRequestOptionsJSON };

type RemoveReadyPhase = {
  kind: "ready";
  challenge: RemovalChallenge;
  attemptFailed: boolean;
  submitting: boolean;
};

type RemoveModalPhase = { kind: "loading" } | { kind: "loadError" } | RemoveReadyPhase;

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
  const [phase, setPhase] = useState<RemoveModalPhase>({ kind: "loading" });
  const isOpen = target !== null;

  const load = useCallback(async () => {
    setPhase({ kind: "loading" });
    const outcome = await fetchPasskeyRemovalChallenge();
    if (outcome.kind === "ok") {
      setPhase({
        kind: "ready",
        challenge: outcome.value,
        attemptFailed: false,
        submitting: false,
      });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else {
      setPhase({ kind: "loadError" });
    }
  }, [onSessionEnded]);

  useEffect(() => {
    if (isOpen) {
      void load();
    }
  }, [isOpen, load]);

  // See RegisterPasskeyModal's refreshAfterRejectedAttempt: the removal challenge is consumed the
  // same way (passkeys-removal-route.ts), so only an attempt that actually reached the cloud needs
  // fresh options before a retry.
  async function refreshAfterRejectedAttempt() {
    setPhase({ kind: "loading" });
    const outcome = await fetchPasskeyRemovalChallenge();
    if (outcome.kind === "ok") {
      setPhase({ kind: "ready", challenge: outcome.value, attemptFailed: true, submitting: false });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else {
      setPhase({ kind: "loadError" });
    }
  }

  async function handleConfirm(readyPhase: RemoveReadyPhase) {
    if (!target) {
      return;
    }
    setPhase({ ...readyPhase, attemptFailed: false, submitting: true });

    const reauthentication = await startAuthentication({
      optionsJSON: readyPhase.challenge.reauthenticationOptions,
    }).catch((): AuthenticationResponseJSON | null => null);
    if (!reauthentication) {
      setPhase({ ...readyPhase, attemptFailed: true, submitting: false });
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
    await refreshAfterRejectedAttempt();
  }

  const ready = phase.kind === "ready" ? phase : undefined;

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
            isDisabled={ready ? ready.submitting : false}
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
            isDisabled={!ready || ready.submitting}
            onPress={() => ready && void handleConfirm(ready)}
          >
            {removeMessages.confirm}
          </Button>
        </>
      }
    >
      {phase.kind === "loading" && <p role="status">{passkeysMessages.loading}</p>}
      {phase.kind === "loadError" && (
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
      {ready && target && (
        <div className="flex flex-col gap-4">
          <p className="text-base text-ink">{removeMessages.body({ name: target.name })}</p>
          {isOnlyPasskey && (
            <InlineNotice
              tone="warning"
              icon={<TriangleAlert />}
              detail={removeMessages.onlyPasskeyWarning}
            />
          )}
          {ready.attemptFailed && (
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
    }
  }

  const passkeys = list.kind === "loaded" ? list.passkeys : [];
  const isOnlyPasskey = passkeys.length === 1;

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
            <h2 className="flex-1 font-bold text-lg text-brand-earth-ui">
              {passkeysMessages.title}
            </h2>
            <Button variant="secondary" icon={<Plus />} onPress={() => setRegisterModalOpen(true)}>
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
