import type { StartMercadoPagoChargeOutcome } from "@purosur/contracts";
import {
  Button,
  fieldErrorMessage,
  formatAmountInput,
  formatCents,
  InlineNotice,
  Modal,
  SummaryRowGroup,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { ArrowLeft, CreditCard, Info, Send, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { INVALID_AMOUNT_MESSAGE } from "./cash-charge-form";
import {
  mercadoPagoChargeRequestFrom,
  mercadoPagoChargeRequestSchema,
} from "./mercado-pago-charge-form";
import {
  CHARGE_IN_PROGRESS_MESSAGE,
  exceedsPendingMessage,
  ORDER_FAILED_MESSAGE,
} from "./mercado-pago-charge-messages";

const REFUSED_MESSAGE = "Mercado Pago rechazó la orden. Cobrá con otro medio.";
const NOT_CONFIGURED_MESSAGE = "La Point integrada no está configurada en esta caja.";

export type ShownPointOrder = Extract<
  StartMercadoPagoChargeOutcome,
  { kind: "order_shown" | "order_unconfirmed" }
>;

export type PointChargeModalProps = {
  total: number;
  paid: number;
  pending: number;
  minimum: number;
  start: (amount: number) => Promise<StartMercadoPagoChargeOutcome>;
  onChooseAnotherMethod: () => void;
  onOrderShown: (order: ShownPointOrder) => void;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function PointChargeModal({
  total,
  paid,
  pending,
  minimum,
  start,
  onChooseAnotherMethod,
  onOrderShown,
  onSaleUnavailable,
  onSessionInvalid,
}: PointChargeModalProps) {
  const [notice, setNotice] = useState<string>();
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
          setNotice(NOT_CONFIGURED_MESSAGE);
          break;
        case "order_refused":
          setNotice(REFUSED_MESSAGE);
          break;
        case "mercado_pago_charge_in_progress":
          setNotice(CHARGE_IN_PROGRESS_MESSAGE);
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
          setNotice(ORDER_FAILED_MESSAGE);
          break;
      }
    },
  });

  function sendToTerminal() {
    setNotice(undefined);
    void submit();
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) {
          onChooseAnotherMethod();
        }
      }}
      width="standard"
      tone="info"
      icon={<CreditCard />}
      context="POINT INTEGRADA"
      contextTone="info"
      title="¿Cuánto se cobra con la Point?"
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            disabled={submitting}
            onPress={onChooseAnotherMethod}
          >
            Cambiar de medio
          </Button>
          <Button
            size="large"
            fullWidth
            icon={<Send />}
            dataStatus={submitting ? "loading" : "loaded"}
            onPress={sendToTerminal}
          >
            Enviar a la terminal
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <SummaryRowGroup
          rows={[
            { label: "Total de la venta", value: formatCents(total) },
            { label: "Pagado", value: formatCents(paid) },
            { label: "Saldo pendiente", value: formatCents(pending) },
          ]}
        />
        <form.AppField name="amount" listeners={{ onChange: () => setNotice(undefined) }}>
          {(field) => (
            <TextField
              kind="amount"
              prefix="$"
              label="Importe a cobrar con este medio"
              description={`Hasta el saldo pendiente, ${formatCents(pending)}. Si cobrás menos, el resto queda pendiente para otro medio.`}
              inputMode="numeric"
              value={field.state.value}
              onChange={field.handleChange}
              disabled={submitting}
              errorMessage={fieldErrorMessage(field.state.meta.errors)}
            />
          )}
        </form.AppField>
        <InlineNotice
          tone="info"
          icon={<Info />}
          title="El cobro se envía a la terminal por este importe. Después ya no se puede cambiar."
        />
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
