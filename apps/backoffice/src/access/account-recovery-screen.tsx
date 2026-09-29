import { recoveryRequestBodySchema } from "@purosur/contracts";
import { Button, InlineNotice } from "@purosur/ui";
import { ArrowLeft, MailCheck, Send, ShieldX, TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useCloudForm } from "../platform/cloud-form";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { AccessFooterLink, AccessHeader, AccessLayout } from "./access-layout";
import type { AccountRecoveryScreenServices } from "./account-recovery-services";
import { emailFieldMessage } from "./email-field-message";

type Notice = { kind: "rate_limited"; retryAfterSeconds: number } | { kind: "error" };

export type AccountRecoveryScreenProps = {
  services: AccountRecoveryScreenServices;
};

const EMAIL_MESSAGE = emailFieldMessage({
  required: "Ingresá tu correo.",
  invalid: "Ingresá un correo válido.",
  review: "Revisá tu correo.",
});

export function AccountRecoveryScreen({ services }: AccountRecoveryScreenProps) {
  const { requestRecoveryLink } = services;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sent, setSent] = useState(false);
  const { form, submit, submitting } = useCloudForm({
    defaultValues: { email: "" },
    request: { schema: recoveryRequestBodySchema, from: ({ email }) => ({ email }) },
    fields: { email: "email" },
    messages: { email: EMAIL_MESSAGE },
    onSubmit: async ({ email }, { showWireFieldError }) => {
      setNotice(null);
      const outcome = await requestRecoveryLink(email);
      if (outcome.kind === "sent") {
        setSent(true);
      } else if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
      } else if (outcome.kind !== "validation_failed" || !showWireFieldError(outcome.field)) {
        setNotice({ kind: "error" });
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  if (sent) {
    return (
      <AccessLayout>
        <AccessHeader eyebrow="Recuperar el acceso" heading="Revisá tu correo" />
        <InlineNotice
          tone="info"
          icon={<MailCheck />}
          title="Si el correo es de una cuenta, te enviamos el enlace"
          description="Vale 15 minutos y se usa una sola vez. Si no aparece, mirá en correo no deseado."
        />
        <AccessFooterLink to="/sign-in" icon={<ArrowLeft />} label="Volver a ingresar" />
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
          description={retryAfterDetail(notice.retryAfterSeconds)}
        />
      )}
      {notice?.kind === "error" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No pudimos enviar el enlace"
          description="Probá de nuevo en unos minutos."
        />
      )}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <form.AppField name="email">
          {(field) => <field.TextField kind="plain-text" label="Correo de tu cuenta" required />}
        </form.AppField>
        <Button
          type="submit"
          variant="primary"
          size="large"
          fullWidth
          icon={<Send />}
          disabled={submitting}
        >
          Enviar el enlace
        </Button>
      </form>
      <AccessFooterLink to="/sign-in" icon={<ArrowLeft />} label="Volver a ingresar" />
    </AccessLayout>
  );
}
