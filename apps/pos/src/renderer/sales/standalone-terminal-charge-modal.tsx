import type { ChargeSaleOnStandaloneTerminalOutcome } from "@purosur/contracts";
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
import { ArrowLeft, Calculator, Check, Info, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { INVALID_AMOUNT_MESSAGE } from "./cash-charge-form";
import {
  chargeSaleOnStandaloneTerminalRequestSchema,
  handChargeRequestFrom,
} from "./hand-charge-form";
import { CHARGE_IN_PROGRESS_MESSAGE } from "./mercado-pago-charge-messages";

const FAILED_MESSAGE = "No se pudo cobrar la venta. Probá de nuevo.";

function exceedsPendingMessage(pending: number): string {
  return `No puede superar el saldo pendiente de ${formatCents(pending)}.`;
}

export type CompletedStandaloneTerminal = Extract<
  ChargeSaleOnStandaloneTerminalOutcome,
  { kind: "completed" }
> & {
  amount: number;
};

export type StandaloneTerminalChargeModalProps = {
  total: number;
  paid: number;
  pending: number;
  charge: (amount: number) => Promise<ChargeSaleOnStandaloneTerminalOutcome>;
  onChooseAnotherMethod: () => void;
  onCompleted: (charge: CompletedStandaloneTerminal) => void;
  onPartiallyPaid: () => Promise<void>;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function StandaloneTerminalChargeModal({
  total,
  paid,
  pending,
  charge,
  onChooseAnotherMethod,
  onCompleted,
  onPartiallyPaid,
  onSaleUnavailable,
  onSessionInvalid,
}: StandaloneTerminalChargeModalProps) {
  const [notice, setNotice] = useState<string>();
  const { form, submit, submitting } = useRequestForm({
    defaultValues: { amount: formatAmountInput(pending) },
    request: { schema: chargeSaleOnStandaloneTerminalRequestSchema, from: handChargeRequestFrom },
    fields: { amount: "amount" },
    messages: { amount: INVALID_AMOUNT_MESSAGE },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await charge(request.amount).catch(
        (): ChargeSaleOnStandaloneTerminalOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "completed":
          onCompleted({ ...outcome, amount: request.amount });
          break;
        case "partially_paid":
          await onPartiallyPaid();
          break;
        case "exceeds_pending":
          showFieldError("amount", exceedsPendingMessage(outcome.pending));
          break;
        case "invalid_amount":
          showFieldError("amount", INVALID_AMOUNT_MESSAGE);
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
        case "mercado_pago_charge_in_progress":
          setNotice(CHARGE_IN_PROGRESS_MESSAGE);
          break;
        case "unavailable":
          setNotice(FAILED_MESSAGE);
          break;
      }
    },
  });

  function registerApprovedPayment() {
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
      icon={<Calculator />}
      context="TERMINAL INDEPENDIENTE"
      contextTone="info"
      title="Cargá el resultado de la segunda Point"
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
            icon={<Check />}
            dataStatus={submitting ? "loading" : "loaded"}
            onPress={registerApprovedPayment}
          >
            Registrar pago aprobado
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <SummaryRowGroup
          rows={[
            { label: "Total de la venta", value: formatCents(total) },
            { label: "Pagado", value: formatCents(paid) },
            { label: "A cobrar ahora", value: formatCents(pending) },
          ]}
        />
        <InlineNotice
          tone="info"
          icon={<Info />}
          title="Cobrá en la segunda Point, que funciona sin la caja, y cargá acá lo que muestra la terminal."
        />
        <form.AppField name="amount" listeners={{ onChange: () => setNotice(undefined) }}>
          {(field) => (
            <TextField
              kind="amount"
              prefix="$"
              label="Importe a cobrar con este medio"
              description={`Hasta el saldo pendiente, ${formatCents(pending)}. Si cobrás menos, el resto queda pendiente para otro medio.`}
              inputMode="decimal"
              value={field.state.value}
              onChange={field.handleChange}
              disabled={submitting}
              errorMessage={fieldErrorMessage(field.state.meta.errors)}
            />
          )}
        </form.AppField>
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
