import type { PinCodeRedemptionOutcome } from "@purosur/contracts";
import { newPinSchema, PIN_MIN_DIGITS, pinCodeRedemptionBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, TextField } from "@purosur/ui";
import { Check, Lock, ShieldX, TriangleAlert, WifiOff } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useId, useState } from "react";
import { retryAfterText } from "../shell/retry-after-text";

const CODE_MESSAGE = "Revisá el código: son 16 letras y números.";
const PIN_MESSAGE = `El PIN tiene que tener al menos ${PIN_MIN_DIGITS} dígitos, solo números.`;
const REPEAT_MESSAGE = "Los dos PIN no coinciden.";

const NEW_CODE_PLACE = { backoffice: " en el backoffice", register: "" } as const;

type NewCodePlace = keyof typeof NEW_CODE_PLACE;

function noticeFor(outcome: PinCodeRedemptionOutcome, newCodeAskedIn: NewCodePlace) {
  const place = NEW_CODE_PLACE[newCodeAskedIn];
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
        description: `Revisá que esté bien escrito o pedí un código nuevo${place}.`,
      };
    case "code_expired":
      return {
        icon: <ShieldX />,
        title: "El código venció",
        description: `Pedí un código nuevo${place}.`,
      };
    case "code_burned":
      return {
        icon: <ShieldX />,
        title: "El código ya no sirve",
        description: `Ya se usó o se probó demasiadas veces. Pedí un código nuevo${place}.`,
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

export type PinCodeRedemptionFormProps = {
  redeem: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
  onRedeemed: (newPin: string) => void | Promise<void>;
  submitLabel: string;
  newCodeAskedIn: NewCodePlace;
  children?: ReactNode;
};

export function PinCodeRedemptionForm({
  redeem,
  onRedeemed,
  submitLabel,
  newCodeAskedIn,
  children,
}: PinCodeRedemptionFormProps) {
  const [code, setCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [problems, setProblems] = useState({ code: false, pin: false, repeat: false });
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<PinCodeRedemptionOutcome>();
  const noticeId = useId();

  const notice = outcome === undefined ? undefined : noticeFor(outcome, newCodeAskedIn);
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
    if (answered.kind === "redeemed") {
      setNewPin("");
      setRepeat("");
      await onRedeemed(newPin);
    }
    if (answered.kind === "resumed") {
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
    <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
      <TextField kind="plain-text" label="Código" value={code} onChange={setCode} {...codeError} />
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
        {submitLabel}
      </Button>
      {children}
    </form>
  );
}
