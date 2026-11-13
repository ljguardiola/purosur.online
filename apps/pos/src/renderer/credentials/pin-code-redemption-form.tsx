import type { PinCodeRedemptionOutcome, PinPolicy } from "@purosur/contracts";
import {
  Button,
  fieldErrorMessage,
  InlineNotice,
  PinDotsField,
  SharedFieldError,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { Check, ShieldX, TriangleAlert, WifiOff } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { focusFirstInput } from "../platform/focus-first-input";
import { BrandPanelLegend } from "../shell/brand-panel-screen";
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
    case "cash_session_opened_by_another":
      return undefined;
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

const FIELD_LEGEND = [{ keyName: "Tab", label: "Campo" }] as const;

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
  onCashSessionOpenedByAnother: () => void;
  focusOnOpen: "code" | "newPin";
  submitLabel: string;
  newCodeAskedIn: NewCodePlace;
  children?: ReactNode;
};

export function PinCodeRedemptionForm({
  loadPinPolicy,
  checkRedemption,
  redeem,
  onRedeemed,
  onCashSessionOpenedByAnother,
  focusOnOpen,
  submitLabel,
  newCodeAskedIn,
  children,
}: PinCodeRedemptionFormProps) {
  const minDigits = usePinPolicyQuery(loadPinPolicy).min_digits;
  const [outcome, setOutcome] = useState<PinCodeRedemptionOutcome>();
  const noticeId = useId();
  const formElement = useRef<HTMLFormElement | null>(null);
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
      if (CODE_OUTCOMES.has(answered.kind)) {
        focusFirstInput(formElement.current);
      }
      switch (answered.kind) {
        case "redeemed":
          reset({ ...values, newPin: "", repeat: "" });
          await onRedeemed(new_pin);
          break;
        case "resumed":
          reset({ ...values, newPin: "", repeat: "" });
          break;
        case "cash_session_opened_by_another":
          onCashSessionOpenedByAnother();
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
    formElement.current = event.currentTarget;
    if (submitting) {
      return;
    }
    setOutcome(undefined);
    void submit();
  }

  return (
    <form
      ref={focusOnOpen === "code" ? focusFirstInput : undefined}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={handleSubmit}
    >
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
          <div className="flex flex-col gap-1.5">
            <SharedFieldError>
              {(errorMessageId) => (
                <PinDotsField
                  label={`PIN nuevo, de al menos ${minDigits} dígitos`}
                  value={newPin.state.value}
                  onChange={newPin.handleChange}
                  digitsKeycap={false}
                  autoFocus={focusOnOpen === "newPin"}
                  errorMessageId={errorMessageId}
                />
              )}
            </SharedFieldError>
          </div>
        )}
      </form.AppField>
      <form.AppField name="repeat">
        {(repeat) => (
          <div className="flex flex-col gap-1.5">
            <SharedFieldError>
              {(errorMessageId) => (
                <PinDotsField
                  label="Repetí el PIN nuevo"
                  value={repeat.state.value}
                  onChange={repeat.handleChange}
                  digitsKeycap={false}
                  errorMessageId={errorMessageId}
                />
              )}
            </SharedFieldError>
          </div>
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
      <Button
        type="submit"
        fullWidth
        icon={<Check />}
        iconPosition="start"
        keycap="Enter"
        disabled={submitting}
      >
        {submitLabel}
      </Button>
      {children}
      <BrandPanelLegend items={FIELD_LEGEND} />
    </form>
  );
}
