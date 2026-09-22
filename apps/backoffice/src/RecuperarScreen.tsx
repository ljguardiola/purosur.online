import { Button, InlineNotice, TextField } from "@purosur/ui";
import { ArrowLeft, MailCheck, Send, ShieldX, TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./AccessLayout";
import { INGRESAR_PATH } from "./accessRoutes";
import { messages } from "./messages";
import { requestRecoveryLink } from "./recoveryApi";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

type Notice = { kind: "rate_limited"; retryAfterSeconds: number } | { kind: "error" };

function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return messages.access.recuperar.emailRequired;
  }
  return EMAIL_SHAPE.test(trimmed) ? undefined : messages.access.recuperar.emailInvalid;
}

/**
 * The 429 and generic-failure states share the notice-above-the-action pattern used for other
 * blocked-by-attempts states in the product.
 */
export function RecuperarScreen() {
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
          eyebrow={messages.access.recuperar.sentEyebrow}
          heading={messages.access.recuperar.sentHeading}
        />
        <InlineNotice
          tone="info"
          icon={<MailCheck />}
          title={messages.access.recuperar.sentNoticeTitle}
          detail={messages.access.recuperar.sentNoticeDetail}
        />
        <AccessFooterLink
          to={INGRESAR_PATH}
          icon={<ArrowLeft />}
          label={messages.access.recuperar.backLink}
        />
      </AccessLayout>
    );
  }

  return (
    <AccessLayout>
      <AccessHeader
        eyebrow={messages.access.recuperar.eyebrow}
        heading={messages.access.recuperar.heading}
        description={messages.access.recuperar.description}
      />
      {notice?.kind === "rate_limited" && (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title={messages.access.recuperar.rateLimitedTitle}
          detail={messages.access.recuperar.rateLimitedDetail({
            minutes: Math.ceil(notice.retryAfterSeconds / 60),
          })}
        />
      )}
      {notice?.kind === "error" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={messages.access.recuperar.errorTitle}
          detail={messages.access.recuperar.errorDetail}
        />
      )}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <TextField
          kind="plain-text"
          label={messages.access.recuperar.emailLabel}
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
          {messages.access.recuperar.submit}
        </Button>
      </form>
      <AccessFooterLink
        to={INGRESAR_PATH}
        icon={<ArrowLeft />}
        label={messages.access.recuperar.backLink}
      />
    </AccessLayout>
  );
}
