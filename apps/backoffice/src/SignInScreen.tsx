import { Button, InlineNotice } from "@purosur/ui";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import { Clock, KeyRound, LifeBuoy, ShieldX, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./AccessLayout";
import { ACCOUNT_RECOVERY_PATH } from "./accessRoutes";
import { messages } from "./messages";
import { authenticate, fetchAuthenticationOptions } from "./sessionApi";

/**
 * Why the app routed here: because the previous session ended (idle or absolute expiry), because
 * the check that would have told it never got an answer, or because the check itself was rate
 * limited (issue #205).
 */
export type SignInOpeningNotice =
  | { kind: "expired" }
  | { kind: "check_failed" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

export type SignInScreenServices = {
  fetchAuthenticationOptions: typeof fetchAuthenticationOptions;
  authenticate: typeof authenticate;
  startAuthentication: typeof startAuthentication;
};

export const defaultSignInScreenServices: SignInScreenServices = {
  fetchAuthenticationOptions,
  authenticate,
  startAuthentication,
};

export type SignInScreenProps = {
  openingNotice?: SignInOpeningNotice | undefined;
  onSignedIn: () => void;
  /** Injected in tests so sign-in doesn't call the real session API or WebAuthn. */
  services?: SignInScreenServices;
};

type Notice =
  | SignInOpeningNotice
  // From a failed sign-in attempt itself (the sign-in lockout), not the opening session check.
  | { kind: "blocked"; retryAfterSeconds: number }
  | { kind: "failed" };

/**
 * The uniform-failure notice covers a rejected credential/signature, an origin mismatch, a
 * network error, and a cancelled or failed browser passkey prompt alike: nothing about it may
 * let someone infer which of those actually happened.
 */
export function SignInScreen({ openingNotice, onSignedIn, services }: SignInScreenProps) {
  const { fetchAuthenticationOptions, authenticate, startAuthentication } =
    services ?? defaultSignInScreenServices;
  const [notice, setNotice] = useState<Notice | null>(openingNotice ?? null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    setNotice(null);
    setSubmitting(true);

    const optionsOutcome = await fetchAuthenticationOptions();
    if (optionsOutcome.kind !== "ok") {
      setNotice({ kind: "failed" });
      setSubmitting(false);
      return;
    }

    const assertion: AuthenticationResponseJSON | null = await startAuthentication({
      optionsJSON: optionsOutcome.value,
    }).catch(() => null);
    if (!assertion) {
      setNotice({ kind: "failed" });
      setSubmitting(false);
      return;
    }

    const outcome = await authenticate(assertion);
    setSubmitting(false);
    if (outcome.kind === "ok") {
      onSignedIn();
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "blocked", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    setNotice({ kind: "failed" });
  }

  return (
    <AccessLayout>
      <AccessHeader
        eyebrow={messages.access.signIn.eyebrow}
        heading={messages.access.signIn.heading}
        description={messages.access.signIn.description}
      />
      {notice?.kind === "blocked" && (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title={messages.access.signIn.blockedTitle}
          detail={messages.access.signIn.blockedDetail({
            minutes: Math.ceil(notice.retryAfterSeconds / 60),
          })}
        />
      )}
      {notice?.kind === "expired" && (
        <InlineNotice
          tone="info"
          icon={<Clock />}
          title={messages.access.signIn.expiredTitle}
          detail={messages.access.signIn.expiredDetail}
        />
      )}
      {notice?.kind === "check_failed" && (
        <InlineNotice
          tone="warning"
          icon={<TriangleAlert />}
          title={messages.access.signIn.checkFailedTitle}
          detail={messages.access.signIn.checkFailedDetail}
        />
      )}
      {notice?.kind === "rate_limited" && (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title={messages.access.signIn.checkRateLimitedTitle}
          detail={messages.access.signIn.checkRateLimitedDetail({
            minutes: Math.ceil(notice.retryAfterSeconds / 60),
          })}
        />
      )}
      {notice?.kind === "failed" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={messages.access.signIn.attemptFailedTitle}
          detail={messages.access.signIn.attemptFailedDetail}
        />
      )}
      <Button
        variant="primary"
        size="large"
        fullWidth
        icon={<KeyRound />}
        isDisabled={submitting}
        onPress={() => void handleSignIn()}
      >
        {messages.access.signIn.submit}
      </Button>
      <AccessFooterLink
        to={ACCOUNT_RECOVERY_PATH}
        icon={<LifeBuoy />}
        label={messages.access.signIn.recoverLink}
      />
    </AccessLayout>
  );
}
