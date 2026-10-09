import type { SignInLookupOutcome } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import { Button, InlineNotice, useRequestForm } from "@purosur/ui";
import { ArrowLeft, ArrowRight, RefreshCw, ShieldX, TriangleAlert, WifiOff } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { FirstSignInPanel } from "../shell/first-sign-in-panel";
import { retryAfterText } from "../shell/retry-after-text";
import { ScreenLink } from "../shell/screen-link";
import {
  EMPTY_FIRST_SIGN_IN_EMAIL_FORM,
  INVALID_EMAIL_MESSAGE,
  signInLookupRequestFrom,
  signInLookupRequestSchema,
} from "./first-sign-in-email-form";

export type FoundPerson = Extract<SignInLookupOutcome, { kind: "has_pin" | "no_pin" }>;

type Refused = Exclude<SignInLookupOutcome, FoundPerson>;

type Notice = { icon: Icon; title: string; description: string };

const NOT_FOUND_MESSAGE = "No hay nadie con ese correo en esta sucursal.";

function noticeFor(refused: Refused): Notice | undefined {
  switch (refused.kind) {
    case "not_found":
    case "invalid_email":
      return undefined;
    case "rate_limited":
      return {
        icon: <ShieldX />,
        title: "Demasiados intentos",
        description: retryAfterText(refused.retry_after_seconds),
      };
    case "not_synced":
      return {
        icon: <RefreshCw />,
        title: "Esta caja todavía no tiene tus datos",
        description: "Llegan solos si hay internet. Probá de nuevo en unos minutos.",
      };
    case "unreachable":
      return {
        icon: <WifiOff />,
        title: "Sin conexión a internet",
        description: "El correo se comprueba en línea. Cuando vuelva la conexión se puede seguir.",
      };
    case "unavailable":
      return {
        icon: <TriangleAlert />,
        title: "No se pudo buscar tu correo",
        description: "Puro Sur no responde en este momento. Probá de nuevo en unos minutos.",
      };
  }
}

export type FirstSignInEmailStepProps = {
  lookup: (email: string) => Promise<SignInLookupOutcome>;
  onFound: (person: FoundPerson) => void;
};

export function FirstSignInEmailStep({ lookup, onFound }: FirstSignInEmailStepProps) {
  const [refused, setRefused] = useState<Refused>();
  const { form, submit, submitting } = useRequestForm({
    defaultValues: EMPTY_FIRST_SIGN_IN_EMAIL_FORM,
    request: { schema: signInLookupRequestSchema, from: signInLookupRequestFrom },
    fields: { email: "email" },
    messages: { email: INVALID_EMAIL_MESSAGE },
    onSubmit: async ({ email }, { showFieldError }) => {
      const outcome = await lookup(email).catch(
        (): SignInLookupOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "has_pin":
        case "no_pin":
          onFound(outcome);
          break;
        case "invalid_email":
          showFieldError("email", INVALID_EMAIL_MESSAGE);
          break;
        case "not_found":
          showFieldError("email", NOT_FOUND_MESSAGE);
          break;
        default:
          setRefused(outcome);
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setRefused(undefined);
    void submit();
  }

  const notice = refused === undefined ? undefined : noticeFor(refused);

  return (
    <FirstSignInPanel
      title="Ingresar por primera vez"
      description="Escribí tu correo. Hace falta internet."
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
        <form.AppField name="email" listeners={{ onChange: () => setRefused(undefined) }}>
          {(email) => <email.TextField kind="plain-text" label="Correo" disabled={submitting} />}
        </form.AppField>
        {notice === undefined ? null : (
          <InlineNotice
            tone="error"
            icon={notice.icon}
            title={notice.title}
            description={notice.description}
          />
        )}
        <Button type="submit" fullWidth icon={<ArrowRight />} disabled={submitting}>
          Continuar
        </Button>
        <ScreenLink to="/sign-in" icon={<ArrowLeft />} label="Volver" />
      </form>
    </FirstSignInPanel>
  );
}
