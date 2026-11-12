import type { StartMercadoPagoChargeOutcome } from "@purosur/contracts";
import type { PointCardType } from "@purosur/domain";
import {
  Button,
  FigureStat,
  fieldErrorMessage,
  formatAmountInput,
  formatCents,
  InlineNotice,
  SidePanel,
  SidePanelTitle,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { ArrowRight, CreditCard, Send, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { pointCardTitle } from "../platform/payment-method-names";
import { INVALID_AMOUNT_MESSAGE } from "./cash-charge-form";
import {
  mercadoPagoChargeRequestFrom,
  mercadoPagoChargeRequestSchema,
} from "./mercado-pago-charge-form";
import {
  CHARGE_IN_PROGRESS_MESSAGE,
  exceedsPendingMessage,
  ORDER_FAILED_MESSAGE,
  PAID_ORDER_NOT_APPLIED_MESSAGE,
} from "./mercado-pago-charge-messages";

const REFUSED_MESSAGE = "Mercado Pago rechazó la orden. Cobrá con otro medio.";
const NOT_CONFIGURED_MESSAGE = "La Point integrada no está configurada en esta caja.";

export type ShownPointOrder = Extract<
  StartMercadoPagoChargeOutcome,
  { kind: "order_shown" | "order_unconfirmed" }
>;

type Notice = { message: string; retryable: boolean };

export type PointChargePanelProps = {
  pending: number;
  cardType: PointCardType;
  minimum: number;
  start: (amount: number) => Promise<StartMercadoPagoChargeOutcome>;
  onChooseAnotherMethod: () => void;
  onOrderShown: (order: ShownPointOrder) => void;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function PointChargePanel({
  pending,
  cardType,
  minimum,
  start,
  onChooseAnotherMethod,
  onOrderShown,
  onSaleUnavailable,
  onSessionInvalid,
}: PointChargePanelProps) {
  const amountBox = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>();
  const { form, submit, submitting } = useRequestForm({
    defaultValues: { amount: formatAmountInput(pending) },
    request: { schema: mercadoPagoChargeRequestSchema, from: mercadoPagoChargeRequestFrom },
    fields: { amount: "amount" },
    messages: { amount: INVALID_AMOUNT_MESSAGE },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await start(request.amount).catch(
        (): StartMercadoPagoChargeOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "order_shown":
        case "order_unconfirmed":
          onOrderShown(outcome);
          break;
        case "exceeds_pending":
          showFieldError("amount", exceedsPendingMessage(outcome.pending));
          break;
        case "invalid_amount":
          showFieldError("amount", INVALID_AMOUNT_MESSAGE);
          break;
        case "below_minimum":
          showFieldError("amount", `La Point no acepta cobros menores a ${formatCents(minimum)}`);
          break;
        case "not_configured":
          setNotice({ message: NOT_CONFIGURED_MESSAGE, retryable: false });
          break;
        case "order_refused":
          setNotice({ message: REFUSED_MESSAGE, retryable: false });
          break;
        case "mercado_pago_charge_in_progress":
          setNotice({ message: CHARGE_IN_PROGRESS_MESSAGE, retryable: false });
          break;
        case "paid_order_not_applied":
          setNotice({ message: PAID_ORDER_NOT_APPLIED_MESSAGE, retryable: false });
          break;
        case "empty_sale":
        case "zero_total":
        case "reaches_buyer_identification_threshold":
        case "no_buyer_identification_threshold":
        case "no_open_sale":
        case "not_permitted":
          onSaleUnavailable();
          break;
        case "not_signed_in":
        case "no_open_session":
          onSessionInvalid();
          break;
        case "unreachable":
        case "unavailable":
          setNotice({ message: ORDER_FAILED_MESSAGE, retryable: true });
          break;
      }
    },
  });

  useEffect(() => {
    amountBox.current?.querySelector("input")?.focus();
  }, []);

  function sendToTerminal() {
    if (submitting) {
      return;
    }
    setNotice(undefined);
    void submit();
  }

  const refused = notice !== undefined && !notice.retryable;

  function pressEnter() {
    if (refused) {
      onChooseAnotherMethod();
    } else {
      sendToTerminal();
    }
  }

  useKeys([
    {
      key: "Escape",
      run: () => {
        if (!submitting) {
          onChooseAnotherMethod();
        }
      },
    },
  ]);
  useKeys([{ key: "Enter", run: pressEnter }], { fallback: true });

  const name = pointCardTitle(cardType);

  return (
    <SidePanel
      label={`Cobro con ${name}`}
      width="wide"
      header={
        <SidePanelTitle
          icon={<CreditCard />}
          title={name}
          closeLabel="Cambiar de medio"
          closeDisabled={submitting}
          onClose={onChooseAnotherMethod}
        />
      }
      footer={
        refused ? (
          <Button
            size="large"
            fullWidth
            icon={<ArrowRight />}
            iconPosition="start"
            keycap="Enter"
            onPress={onChooseAnotherMethod}
          >
            Cambiar de medio
          </Button>
        ) : (
          <Button
            size="large"
            fullWidth
            icon={<Send />}
            iconPosition="start"
            keycap="Enter"
            dataStatus={submitting ? "loading" : "loaded"}
            onPress={sendToTerminal}
          >
            Enviar a la terminal
          </Button>
        )
      }
    >
      <FigureStat size="hero" label="A COBRAR" value={formatCents(pending)} />
      <div ref={amountBox}>
        <form.AppField
          name="amount"
          listeners={{
            onChange: () => setNotice((shown) => (shown?.retryable === false ? shown : undefined)),
          }}
        >
          {(field) => (
            <TextField
              kind="amount"
              prefix="$"
              label="IMPORTE"
              decimals={2}
              value={field.state.value}
              onChange={field.handleChange}
              disabled={submitting}
              errorMessage={fieldErrorMessage(field.state.meta.errors)}
            />
          )}
        </form.AppField>
      </div>
      {notice === undefined ? null : (
        <InlineNotice tone="error" icon={<TriangleAlert />} title={notice.message} />
      )}
    </SidePanel>
  );
}
