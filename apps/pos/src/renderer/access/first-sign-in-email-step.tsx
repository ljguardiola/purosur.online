import type { SignInLookupOutcome } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import { Button, InlineNotice, TextField } from "@purosur/ui";
import { ArrowLeft, ArrowRight, RefreshCw, ShieldX, TriangleAlert, WifiOff } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { retryAfterText } from "../shell/retry-after-text";
import { ScreenLink } from "../shell/screen-link";
import { FirstSignInPanel } from "./first-sign-in-panel";

export type FoundPerson = Extract<SignInLookupOutcome, { kind: "has_pin" | "no_pin" }>;

type Refused = Exclude<SignInLookupOutcome, FoundPerson>;

type Notice = { icon: Icon; title: string; description: string };

const INVALID_EMAIL_MESSAGE = "Escribí un correo válido.";
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

function fieldMessageFor(refused: Refused | undefined): string | undefined {
  switch (refused?.kind) {
    case "invalid_email":
      return INVALID_EMAIL_MESSAGE;
    case "not_found":
      return NOT_FOUND_MESSAGE;
    default:
      return undefined;
  }
}

export type FirstSignInEmailStepProps = {
  lookup: (email: string) => Promise<SignInLookupOutcome>;
  onFound: (person: FoundPerson) => void;
};

export function FirstSignInEmailStep({ lookup, onFound }: FirstSignInEmailStepProps) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refused, setRefused] = useState<Refused>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setRefused(undefined);
    setSubmitting(true);
    const outcome = await lookup(email).catch((): SignInLookupOutcome => ({ kind: "unavailable" }));
    setSubmitting(false);
    if (outcome.kind === "has_pin" || outcome.kind === "no_pin") {
      onFound(outcome);
    } else {
      setRefused(outcome);
    }
  }

  function type(value: string) {
    setEmail(value);
    setRefused(undefined);
  }

  const notice = refused === undefined ? undefined : noticeFor(refused);
  const fieldMessage = fieldMessageFor(refused);

  return (
    <FirstSignInPanel
      title="Ingresar por primera vez"
      description="Escribí tu correo. Hace falta internet."
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
        <TextField
          kind="plain-text"
          label="Correo"
          value={email}
          onChange={type}
          disabled={submitting}
          {...(fieldMessage === undefined ? {} : { errorMessage: fieldMessage })}
        />
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
