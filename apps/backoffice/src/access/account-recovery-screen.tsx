import { Button, InlineNotice, TextField } from "@purosur/ui";
import { ArrowLeft, MailCheck, Send, ShieldX, TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./access-layout";
import { validateEmail } from "./email-validation";
import { requestRecoveryLink } from "./recovery-api";
import { SIGN_IN_PATH } from "./routes";

type Notice = { kind: "rate_limited"; retryAfterSeconds: number } | { kind: "error" };

export type AccountRecoveryScreenServices = {
  requestRecoveryLink: typeof requestRecoveryLink;
};

export const defaultAccountRecoveryScreenServices: AccountRecoveryScreenServices = {
  requestRecoveryLink,
};

export type AccountRecoveryScreenProps = {
  services?: AccountRecoveryScreenServices;
};

const EMAIL_ERRORS = {
  required: "Ingresá tu correo.",
  invalid: "Ingresá un correo válido.",
};

export function AccountRecoveryScreen({ services }: AccountRecoveryScreenProps = {}) {
  const { requestRecoveryLink } = services ?? defaultAccountRecoveryScreenServices;
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateEmail(email, EMAIL_ERRORS);
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
        <AccessHeader eyebrow="Recuperar el acceso" heading="Revisá tu correo" />
        <InlineNotice
          tone="info"
          icon={<MailCheck />}
          title="Si el correo es de una cuenta, te enviamos el enlace"
          detail="Vale 15 minutos y se usa una sola vez. Si no aparece, mirá en correo no deseado."
        />
        <AccessFooterLink to={SIGN_IN_PATH} icon={<ArrowLeft />} label="Volver a ingresar" />
      </AccessLayout>
    );
  }

  return (
    <AccessLayout>
      <AccessHeader
        eyebrow="Perdí mis passkeys"
        heading="Recuperar el acceso"
        description="Te mandamos un enlace al correo de tu cuenta para registrar una passkey nueva."
      />
      {notice?.kind === "rate_limited" && (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title="Demasiados pedidos de recuperación"
          detail={retryAfterDetail(notice.retryAfterSeconds)}
        />
      )}
      {notice?.kind === "error" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No pudimos enviar el enlace"
          detail="Probá de nuevo en unos minutos."
        />
      )}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <TextField
          kind="plain-text"
          label="Correo de tu cuenta"
          value={email}
          onChange={(value) => {
            setEmail(value);
            if (fieldError) {
              setFieldError(validateEmail(value, EMAIL_ERRORS));
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
          Enviar el enlace
        </Button>
      </form>
      <AccessFooterLink to={SIGN_IN_PATH} icon={<ArrowLeft />} label="Volver a ingresar" />
    </AccessLayout>
  );
}
