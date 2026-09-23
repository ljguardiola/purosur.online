import { Button, InlineNotice, TextField } from "@purosur/ui";
import { ArrowLeft, MailCheck, Send, ShieldX, TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./AccessLayout";
import { SIGN_IN_PATH } from "./accessRoutes";
import { messages } from "./messages";
import { requestRecoveryLink } from "./recoveryApi";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

type Notice = { kind: "rate_limited"; retryAfterSeconds: number } | { kind: "error" };

export type AccountRecoveryScreenServices = {
  requestRecoveryLink: typeof requestRecoveryLink;
};

const defaultAccountRecoveryScreenServices: AccountRecoveryScreenServices = {
  requestRecoveryLink,
};

export type AccountRecoveryScreenProps = {
  /** Injected in tests so submitting the form doesn't call the real recovery API. */
  services?: AccountRecoveryScreenServices;
};

function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return messages.access.accountRecovery.emailRequired;
  }
  return EMAIL_SHAPE.test(trimmed) ? undefined : messages.access.accountRecovery.emailInvalid;
}

/**
 * The 429 and generic-failure states share the notice-above-the-action pattern used for other
 * blocked-by-attempts states in the product.
 */
export function AccountRecoveryScreen({ services }: AccountRecoveryScreenProps = {}) {
  const { requestRecoveryLink } = services ?? defaultAccountRecoveryScreenServices;
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateEmail(email);
    setFieldError(validationError);
    if (validationError) {
      return;
    }
    setNotice(null);
    setSubmitting(true);
    const outcome = await requestRecoveryLink(email.trim());
    setSubmitting(false);
    if (outcome.kind === "sent") {
      setSent(true);
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setNotice({ kind: "error" });
    }
  }

  if (sent) {
    return (
      <AccessLayout>
        <AccessHeader
          eyebrow={messages.access.accountRecovery.sentEyebrow}
          heading={messages.access.accountRecovery.sentHeading}
        />
        <InlineNotice
          tone="info"
          icon={<MailCheck />}
          title={messages.access.accountRecovery.sentNoticeTitle}
          detail={messages.access.accountRecovery.sentNoticeDetail}
        />
        <AccessFooterLink
          to={SIGN_IN_PATH}
          icon={<ArrowLeft />}
          label={messages.access.accountRecovery.backLink}
        />
      </AccessLayout>
    );
  }

  return (
    <AccessLayout>
      <AccessHeader
        eyebrow={messages.access.accountRecovery.eyebrow}
        heading={messages.access.accountRecovery.heading}
        description={messages.access.accountRecovery.description}
      />
      {notice?.kind === "rate_limited" && (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title={messages.access.accountRecovery.rateLimitedTitle}
          detail={messages.access.accountRecovery.rateLimitedDetail({
            minutes: Math.ceil(notice.retryAfterSeconds / 60),
          })}
        />
      )}
      {notice?.kind === "error" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={messages.access.accountRecovery.errorTitle}
          detail={messages.access.accountRecovery.errorDetail}
        />
      )}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <TextField
          kind="plain-text"
          label={messages.access.accountRecovery.emailLabel}
          value={email}
          onChange={(value) => {
            setEmail(value);
            if (fieldError) {
              setFieldError(validateEmail(value));
            }
          }}
          required
          {...(fieldError ? { invalid: true, errorMessage: fieldError } : {})}
        />
        <Button
          type="submit"
          variant="primary"
          size="large"
          fullWidth
          icon={<Send />}
          isDisabled={submitting}
        >
          {messages.access.accountRecovery.submit}
        </Button>
      </form>
      <AccessFooterLink
        to={SIGN_IN_PATH}
        icon={<ArrowLeft />}
        label={messages.access.accountRecovery.backLink}
      />
    </AccessLayout>
  );
}
