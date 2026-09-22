import { Button, InlineNotice } from "@purosur/ui";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import { Clock, KeyRound, LifeBuoy, ShieldX, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./AccessLayout";
import { ACCOUNT_RECOVERY_PATH } from "./accessRoutes";
import { messages } from "./messages";
import { authenticate, fetchAuthenticationOptions } from "./sessionApi";

export type SignInScreenProps = {
  /** Set when the app routed here because the previous session ended (idle or absolute expiry). */
  expired?: boolean;
  onSignedIn: () => void;
};

type Notice =
  | { kind: "expired" }
  | { kind: "blocked"; retryAfterSeconds: number }
  | { kind: "failed" };

/**
 * The uniform-failure notice covers a rejected credential/signature, an origin mismatch, a
 * network error, and a cancelled or failed browser passkey prompt alike: nothing about it may
 * let someone infer which of those actually happened.
 */
export function SignInScreen({ expired, onSignedIn }: SignInScreenProps) {
  const [notice, setNotice] = useState<Notice | null>(expired ? { kind: "expired" } : null);
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
