import { Button, InlineNotice } from "@purosur/ui";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { startRegistration } from "@simplewebauthn/browser";
import { ArrowLeft, KeyRound, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./AccessLayout";
import { ACCOUNT_RECOVERY_PATH, SIGN_IN_PATH } from "./accessRoutes";
import { messages } from "./messages";
import { fetchRegistrationOptions, redeemRecovery } from "./recoveryApi";

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

/**
 * Every token/rate-limit/failure state shares the error-tone notice pattern used for other
 * blocked-by-attempts states in the product.
 */
export function RegisterPasskeyScreen() {
  // A lazy initializer runs during the component's initial render, before any effect can strip
  // the fragment. StrictMode (dev only, see main.tsx) calls it twice, but both calls happen in
  // that same initial render, before the mount effect below strips the hash, so both read the
  // same token and the state keeps it even when that effect runs twice.
  const [token] = useState<string | null>(() => readToken());
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

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
  }, [token]);

  useEffect(() => {
    // The token never reaches server logs or a Referer header through the URL fragment; it is
    // stripped from the URL right away so it doesn't linger there.
    // Idempotent by construction: a StrictMode-doubled effect run finds nothing left to strip.
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    void load();
  }, [load]);

  // The cloud keeps only the latest challenge per link, which another tab may have replaced, so an
  // attempt the cloud rejected fetches fresh options for the next one. Every fetch counts against
  // the per-source redemption limit, so an attempt that never reached the cloud keeps its options.
  // It happens now rather than on the next click so that click still starts WebAuthn directly,
  // within its user activation.
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
    setPhase({ ...readyPhase, attemptFailed: false, submitting: true });

    const registration = await startRegistration({ optionsJSON: readyPhase.options }).catch(
      () => null,
    );
    if (!registration) {
      setPhase({ ...readyPhase, attemptFailed: true, submitting: false });
      return;
    }

    const outcome = await redeemRecovery(token, registration);
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
    } else if (outcome.kind === "validation_failed") {
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
