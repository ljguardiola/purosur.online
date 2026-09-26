import { Button, InlineNotice, TextField } from "@purosur/ui";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { startRegistration } from "@simplewebauthn/browser";
import { ArrowLeft, KeyRound, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./AccessLayout";
import { ACCOUNT_RECOVERY_PATH, SIGN_IN_PATH } from "./accessRoutes";
import { messages } from "./messages";
import { validatePasskeyName } from "./passkeyName";
import type { RecoveryTokenOutcome } from "./recoveryApi";
import { fetchRegistrationOptions, redeemRecovery } from "./recoveryApi";
import { signalUnknownCredential } from "./signalUnknownCredential";

// An explicit allowlist, not a denylist: a future outcome kind would otherwise signal by default.
// The exhaustive switch (no default case) makes the compiler refuse a kind this doesn't decide for.
function isDefinitiveRejection(outcome: RecoveryTokenOutcome<unknown>): boolean {
  switch (outcome.kind) {
    case "invalid":
    case "burned":
    case "expired":
    case "validation_failed":
    case "rate_limited":
      return true;
    case "ok":
    case "already_registered":
    case "failed":
      return false;
  }
}

type ReadyPhase = {
  kind: "ready";
  displayName: string;
  options: PublicKeyCredentialCreationOptionsJSON;
  attemptFailed: boolean;
  submitting: boolean;
};

type Phase =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "burned" }
  | { kind: "expired" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loadError" }
  | ReadyPhase
  | { kind: "registered" };

export type RegisterPasskeyScreenServices = {
  fetchRegistrationOptions: typeof fetchRegistrationOptions;
  redeemRecovery: typeof redeemRecovery;
  startRegistration: typeof startRegistration;
  signalUnknownCredential: typeof signalUnknownCredential;
};

export const defaultRegisterPasskeyScreenServices: RegisterPasskeyScreenServices = {
  fetchRegistrationOptions,
  redeemRecovery,
  startRegistration,
  signalUnknownCredential,
};

export type RegisterPasskeyScreenProps = {
  services?: RegisterPasskeyScreenServices;
};

function readToken(): string | null {
  const hash = window.location.hash;
  return hash.length > 1 ? hash.slice(1) : null;
}

function TokenErrorNotice({
  title,
  detail,
  offerNewLink,
}: {
  title: string;
  detail?: string;
  offerNewLink: boolean;
}) {
  return (
    <>
      <InlineNotice
        tone="error"
        icon={<TriangleAlert />}
        title={title}
        {...(detail ? { detail } : {})}
      />
      {offerNewLink && (
        <AccessFooterLink
          to={ACCOUNT_RECOVERY_PATH}
          icon={<ArrowLeft />}
          label={messages.access.registerPasskey.requestNewLink}
        />
      )}
    </>
  );
}

export function RegisterPasskeyScreen({ services }: RegisterPasskeyScreenProps = {}) {
  const { fetchRegistrationOptions, redeemRecovery, startRegistration, signalUnknownCredential } =
    services ?? defaultRegisterPasskeyScreenServices;
  // A lazy initializer runs during the initial render, before any effect strips the fragment;
  // StrictMode's doubled call falls within that same render, so both reads see the same token.
  const [token] = useState<string | null>(() => readToken());
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    if (!token) {
      setPhase({ kind: "invalid" });
      return;
    }
    setPhase({ kind: "loading" });
    const outcome = await fetchRegistrationOptions(token);
    if (outcome.kind === "ok") {
      setPhase({
        kind: "ready",
        displayName: outcome.value.displayName,
        options: outcome.value.options,
        attemptFailed: false,
        submitting: false,
      });
    } else if (
      outcome.kind === "invalid" ||
      outcome.kind === "burned" ||
      outcome.kind === "expired"
    ) {
      setPhase({ kind: outcome.kind });
    } else if (outcome.kind === "rate_limited") {
      setPhase({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setPhase({ kind: "loadError" });
    }
  }, [token, fetchRegistrationOptions]);

  useEffect(() => {
    // A URL fragment never reaches server logs or a Referer header, but it's stripped right away
    // so it doesn't linger in the address bar; idempotent, so a StrictMode-doubled run is a no-op.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    void load();
  }, [load]);

  // A rejected attempt needs fresh options before retrying; fetched now so the next click still
  // starts WebAuthn synchronously, within the browser's required user activation.
  async function refreshAfterRejectedAttempt(recoveryToken: string, readyPhase: ReadyPhase) {
    setPhase({ ...readyPhase, attemptFailed: true, submitting: true });
    const outcome = await fetchRegistrationOptions(recoveryToken);
    if (outcome.kind === "ok") {
      setPhase({
        kind: "ready",
        displayName: outcome.value.displayName,
        options: outcome.value.options,
        attemptFailed: true,
        submitting: false,
      });
    } else if (
      outcome.kind === "invalid" ||
      outcome.kind === "burned" ||
      outcome.kind === "expired"
    ) {
      setPhase({ kind: outcome.kind });
    } else if (outcome.kind === "rate_limited") {
      setPhase({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setPhase({ ...readyPhase, attemptFailed: true, submitting: false });
    }
  }

  async function handleRegister(readyPhase: ReadyPhase) {
    if (!token) {
      setPhase({ kind: "invalid" });
      return;
    }
    const validationError = validatePasskeyName(name, {
      required: messages.access.registerPasskey.nameRequired,
      tooLong: messages.access.registerPasskey.nameTooLong,
    });
    setNameError(validationError);
    if (validationError) {
      return;
    }
    setPhase({ ...readyPhase, attemptFailed: false, submitting: true });

    const registration = await startRegistration({ optionsJSON: readyPhase.options }).catch(
      () => null,
    );
    if (!registration) {
      setPhase({ ...readyPhase, attemptFailed: true, submitting: false });
      return;
    }

    const outcome = await redeemRecovery(token, registration, name.trim());
    // Every definitive rejection but "already registered" means the credential was never saved,
    // so the device should forget it; an ambiguous outcome never signals, since it may have landed.
    if (isDefinitiveRejection(outcome)) {
      const rpId = readyPhase.options.rp.id;
      if (rpId) {
        signalUnknownCredential({ rpId, credentialId: registration.id });
      }
    }
    if (outcome.kind === "ok") {
      setPhase({ kind: "registered" });
    } else if (
      outcome.kind === "invalid" ||
      outcome.kind === "burned" ||
      outcome.kind === "expired"
    ) {
      setPhase({ kind: outcome.kind });
    } else if (outcome.kind === "rate_limited") {
      setPhase({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "validation_failed" || outcome.kind === "already_registered") {
      await refreshAfterRejectedAttempt(token, readyPhase);
    } else {
      setPhase({ ...readyPhase, attemptFailed: true, submitting: false });
    }
  }

  if (phase.kind === "loading") {
    return (
      <AccessLayout>
        <AccessHeader heading={messages.access.registerPasskey.heading} />
        <p role="status">{messages.access.registerPasskey.loading}</p>
      </AccessLayout>
    );
  }

  if (phase.kind === "invalid" || phase.kind === "burned" || phase.kind === "expired") {
    const copy = {
      invalid: {
        title: messages.access.registerPasskey.invalidTitle,
        detail: messages.access.registerPasskey.invalidDetail,
      },
      burned: {
        title: messages.access.registerPasskey.burnedTitle,
        detail: messages.access.registerPasskey.burnedDetail,
      },
      expired: {
        title: messages.access.registerPasskey.expiredTitle,
        detail: messages.access.registerPasskey.expiredDetail,
      },
    }[phase.kind];
    return (
      <AccessLayout>
        <AccessHeader heading={messages.access.registerPasskey.heading} />
        <TokenErrorNotice title={copy.title} detail={copy.detail} offerNewLink />
      </AccessLayout>
    );
  }

  if (phase.kind === "rate_limited") {
    return (
      <AccessLayout>
        <AccessHeader heading={messages.access.registerPasskey.heading} />
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title={messages.access.registerPasskey.rateLimitedTitle}
          detail={messages.access.registerPasskey.rateLimitedDetail({
            minutes: Math.ceil(phase.retryAfterSeconds / 60),
          })}
        />
      </AccessLayout>
    );
  }

  if (phase.kind === "loadError") {
    return (
      <AccessLayout>
        <AccessHeader heading={messages.access.registerPasskey.heading} />
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={messages.access.registerPasskey.loadErrorTitle}
          detail={messages.access.registerPasskey.loadErrorDetail}
        />
        <Button variant="secondary" onPress={() => void load()}>
          {messages.access.registerPasskey.retry}
        </Button>
      </AccessLayout>
    );
  }

  if (phase.kind === "registered") {
    return (
      <AccessLayout>
        <AccessHeader heading={messages.access.registerPasskey.successTitle} />
        <InlineNotice
          tone="info"
          icon={<ShieldCheck />}
          title={messages.access.registerPasskey.sessionsClosedTitle}
          detail={messages.access.registerPasskey.sessionsClosedDetail}
        />
        <AccessFooterLink
          to={SIGN_IN_PATH}
          icon={<ArrowLeft />}
          label={messages.access.registerPasskey.goToSignIn}
        />
      </AccessLayout>
    );
  }

  return (
    <AccessLayout>
      <AccessHeader
        eyebrow={phase.displayName}
        heading={messages.access.registerPasskey.heading}
        description={messages.access.registerPasskey.description}
      />
      {phase.attemptFailed && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={messages.access.registerPasskey.attemptFailedTitle}
          detail={messages.access.registerPasskey.attemptFailedDetail}
        />
      )}
      <TextField
        kind="plain-text"
        label={messages.access.registerPasskey.nameLabel}
        value={name}
        onChange={(value) => {
          setName(value);
          if (nameError) {
            setNameError(
              validatePasskeyName(value, {
                required: messages.access.registerPasskey.nameRequired,
                tooLong: messages.access.registerPasskey.nameTooLong,
              }),
            );
          }
        }}
        helperText={messages.access.registerPasskey.nameHelper}
        required
        {...(nameError ? { invalid: true, errorMessage: nameError } : {})}
      />
      <Button
        variant="primary"
        size="large"
        fullWidth
        icon={<KeyRound />}
        isDisabled={phase.submitting}
        onPress={() => void handleRegister(phase)}
      >
        {messages.access.registerPasskey.submit}
      </Button>
      <p className="text-sm text-ink-secondary">{messages.access.registerPasskey.footerHint}</p>
    </AccessLayout>
  );
}
