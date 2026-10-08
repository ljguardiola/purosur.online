import type { PinCodeRedemptionOutcome, PinPolicy } from "@purosur/contracts";
import { Button, fieldErrorMessage, InlineNotice, TextField, useRequestForm } from "@purosur/ui";
import { Check, Lock, ShieldX, TriangleAlert, WifiOff } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useId, useState } from "react";
import { retryAfterText } from "../shell/retry-after-text";
import { usePinPolicyQuery } from "./credentials-queries";
import {
  CODE_MESSAGE,
  EMPTY_PIN_REDEMPTION_FORM,
  pinMessage,
  pinRedemptionRequestFrom,
  pinRedemptionRequestSchema,
  REPEAT_MESSAGE,
} from "./pin-redemption-form";

const NEW_CODE_PLACE = { backoffice: " en el backoffice", register: "" } as const;

type NewCodePlace = keyof typeof NEW_CODE_PLACE;

function noticeFor(outcome: PinCodeRedemptionOutcome, newCodeAskedIn: NewCodePlace) {
  const place = NEW_CODE_PLACE[newCodeAskedIn];
  switch (outcome.kind) {
    case "redeemed":
    case "resumed":
    case "pin_rejected":
    case "invalid_input":
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
  loadPinPolicy: () => Promise<PinPolicy>;
  checkRedemption: (typedCode: string, newPin: string) => Promise<("reset_code" | "new_pin")[]>;
  redeem: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
  onRedeemed: (newPin: string) => void | Promise<void>;
  submitLabel: string;
  newCodeAskedIn: NewCodePlace;
  children?: ReactNode;
};

export function PinCodeRedemptionForm({
  loadPinPolicy,
  checkRedemption,
  redeem,
  onRedeemed,
  submitLabel,
  newCodeAskedIn,
  children,
}: PinCodeRedemptionFormProps) {
  const minDigits = usePinPolicyQuery(loadPinPolicy).min_digits;
  const [outcome, setOutcome] = useState<PinCodeRedemptionOutcome>();
  const noticeId = useId();
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_PIN_REDEMPTION_FORM,
    request: { schema: pinRedemptionRequestSchema, from: pinRedemptionRequestFrom },
    fields: { reset_code: "code", new_pin: "newPin", repeat: "repeat" },
    messages: { code: CODE_MESSAGE, newPin: pinMessage(minDigits), repeat: REPEAT_MESSAGE },
    check: ({ reset_code, new_pin }) => checkRedemption(reset_code, new_pin),
    onSubmit: async ({ reset_code, new_pin }, { values, showWireFieldError }) => {
      const answered = await redeem(reset_code, new_pin).catch(
        (): PinCodeRedemptionOutcome => ({ kind: "unavailable" }),
      );
      setOutcome(answered);
      switch (answered.kind) {
        case "redeemed":
          reset({ ...values, newPin: "", repeat: "" });
          await onRedeemed(new_pin);
          break;
        case "resumed":
          reset({ ...values, newPin: "", repeat: "" });
          break;
        case "cash_session_opened_by_another":
          reset();
          break;
        case "pin_rejected":
          showWireFieldError("new_pin");
          break;
        case "invalid_input":
          answered.fields.forEach(showWireFieldError);
          break;
        default:
          break;
      }
    },
  });

  const notice = outcome === undefined ? undefined : noticeFor(outcome, newCodeAskedIn);
  const codeRejected = outcome !== undefined && CODE_OUTCOMES.has(outcome.kind);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setOutcome(undefined);
    void submit();
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <form.AppField name="code">
        {(code) => {
          const message = fieldErrorMessage(code.state.meta.errors);
          return (
            <TextField
              kind="plain-text"
              label="Código"
              value={code.state.value}
              onChange={code.handleChange}
              {...(message === undefined && codeRejected
                ? { errorMessageId: noticeId }
                : { errorMessage: message })}
            />
          );
        }}
      </form.AppField>
      <form.AppField name="newPin">
        {(newPin) => (
          <newPin.TextField
            kind="plain-text"
            type="password"
            inputMode="numeric"
            label={`PIN nuevo, de al menos ${minDigits} dígitos`}
          />
        )}
      </form.AppField>
      <form.AppField name="repeat">
        {(repeat) => (
          <repeat.TextField
            kind="plain-text"
            type="password"
            inputMode="numeric"
            label="Repetí el PIN nuevo"
          />
        )}
      </form.AppField>
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
