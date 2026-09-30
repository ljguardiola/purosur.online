import type { PinCodeRedemptionOutcome } from "@purosur/contracts";
import { newPinSchema, PIN_MIN_DIGITS, pinCodeRedemptionBodySchema } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import { Button, InlineNotice, TextField } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, CircleCheck, Lock, ShieldX, TriangleAlert, WifiOff } from "lucide-react";
import type { FormEvent } from "react";
import { useId, useState } from "react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { retryAfterText } from "../shell/retry-after-text";
import { ScreenLink } from "../shell/screen-link";

type Notice = { icon: Icon; title: string; description: string };

const CODE_MESSAGE = "Revisá el código: son 16 letras y números.";
const PIN_MESSAGE = `El PIN tiene que tener al menos ${PIN_MIN_DIGITS} dígitos, solo números.`;
const REPEAT_MESSAGE = "Los dos PIN no coinciden.";

function noticeFor(outcome: PinCodeRedemptionOutcome): Notice | undefined {
  switch (outcome.kind) {
    case "redeemed":
    case "resumed":
    case "pin_rejected":
      return undefined;
    case "cash_session_opened_by_another":
      return {
        icon: <Lock />,
        title: "La caja está abierta",
        description: "El PIN nuevo quedó guardado, pero solo puede entrar quien abrió la caja.",
      };
    case "code_invalid":
      return {
        icon: <ShieldX />,
        title: "El código no existe",
        description: "Revisá que esté bien escrito o pedí un código nuevo en el backoffice.",
      };
    case "code_expired":
      return {
        icon: <ShieldX />,
        title: "El código venció",
        description: "Pedí un código nuevo en el backoffice.",
      };
    case "code_burned":
      return {
        icon: <ShieldX />,
        title: "El código ya no sirve",
        description:
          "Ya se usó o se probó demasiadas veces. Pedí un código nuevo en el backoffice.",
      };
    case "rate_limited":
      return {
        icon: <ShieldX />,
        title: "Demasiadas solicitudes",
        description: retryAfterText(outcome.retry_after_seconds),
      };
    case "unreachable":
      return {
        icon: <WifiOff />,
        title: "Sin conexión a internet",
        description:
          "El código se comprueba en línea. Cuando vuelva la conexión se puede guardar el PIN nuevo.",
      };
    case "unavailable":
      return {
        icon: <TriangleAlert />,
        title: "No se pudo guardar el PIN nuevo",
        description: "Puro Sur no responde en este momento. Probá de nuevo en unos minutos.",
      };
  }
}

const CODE_OUTCOMES = new Set<PinCodeRedemptionOutcome["kind"]>([
  "code_invalid",
  "code_expired",
  "code_burned",
]);

export type PinCodeRedemptionScreenProps = {
  redeem: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
};

export function PinCodeRedemptionScreen({ redeem }: PinCodeRedemptionScreenProps) {
  const [code, setCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [problems, setProblems] = useState({ code: false, pin: false, repeat: false });
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<PinCodeRedemptionOutcome>();
  const noticeId = useId();
  const navigate = useNavigate();

  const notice = outcome === undefined ? undefined : noticeFor(outcome);
  const codeRejected = outcome !== undefined && CODE_OUTCOMES.has(outcome.kind);
  const pinRejected = outcome?.kind === "pin_rejected";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setOutcome(undefined);
    const typedCode = pinCodeRedemptionBodySchema.shape.reset_code.safeParse(code);
    const found = {
      code: !typedCode.success,
      pin: !newPinSchema.safeParse(newPin).success,
      repeat: repeat !== newPin,
    };
    setProblems(found);
    if (!typedCode.success || found.pin || found.repeat) {
      return;
    }
    setSubmitting(true);
    const answered = await redeem(typedCode.data, newPin).catch(
      (): PinCodeRedemptionOutcome => ({ kind: "unavailable" }),
    );
    setOutcome(answered);
    if (answered.kind === "redeemed" || answered.kind === "resumed") {
      setNewPin("");
      setRepeat("");
    }
    if (answered.kind === "cash_session_opened_by_another") {
      setCode("");
      setNewPin("");
      setRepeat("");
    }
    setSubmitting(false);
  }

  const codeError = problems.code
    ? { errorMessage: CODE_MESSAGE }
    : codeRejected
      ? { errorMessageId: noticeId }
      : {};
  const pinError = problems.pin || pinRejected ? { errorMessage: PIN_MESSAGE } : {};
  const repeatError = problems.repeat ? { errorMessage: REPEAT_MESSAGE } : {};

  return (
    <BrandPanelScreen>
      <main className="flex w-full max-w-110 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display text-text-accent">Cambiar el PIN</h1>
          {outcome?.kind === "redeemed" ? null : (
            <p className="text-body text-text-subtle">
              Escribí el código que te dieron desde el backoffice. Hace falta internet.
            </p>
          )}
        </div>
        {outcome?.kind === "redeemed" ? (
          <>
            <InlineNotice
              tone="success"
              icon={<CircleCheck />}
              title="PIN nuevo guardado"
              description="Ya podés entrar con tu PIN nuevo."
            />
            <Button fullWidth onPress={() => navigate({ to: "/sign-in" })}>
              Volver al inicio
            </Button>
          </>
        ) : (
          <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
            <TextField
              kind="plain-text"
              label="Código"
              value={code}
              onChange={setCode}
              {...codeError}
            />
            <TextField
              kind="plain-text"
              type="password"
              inputMode="numeric"
              label={`PIN nuevo, de al menos ${PIN_MIN_DIGITS} dígitos`}
              value={newPin}
              onChange={setNewPin}
              {...pinError}
            />
            <TextField
              kind="plain-text"
              type="password"
              inputMode="numeric"
              label="Repetí el PIN nuevo"
              value={repeat}
              onChange={setRepeat}
              {...repeatError}
            />
            {notice === undefined ? null : (
              <div id={noticeId}>
                <InlineNotice
                  tone="error"
                  icon={notice.icon}
                  title={notice.title}
                  description={notice.description}
                />
              </div>
            )}
            <Button type="submit" fullWidth icon={<Check />} disabled={submitting}>
              Guardar el PIN nuevo
            </Button>
            <ScreenLink to="/sign-in" icon={<ArrowLeft />} label="Volver" />
          </form>
        )}
      </main>
    </BrandPanelScreen>
  );
}
