import type { ChargeSaleOnStandaloneTerminalOutcome } from "@purosur/contracts";
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
import { Calculator, Check, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { INVALID_AMOUNT_MESSAGE } from "./cash-charge-form";
import {
  chargeSaleOnStandaloneTerminalRequestSchema,
  handChargeRequestFrom,
} from "./hand-charge-form";
import {
  CHARGE_IN_PROGRESS_MESSAGE,
  PAID_ORDER_NOT_APPLIED_MESSAGE,
} from "./mercado-pago-charge-messages";

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

export type StandaloneTerminalChargePanelProps = {
  pending: number;
  charge: (amount: number) => Promise<ChargeSaleOnStandaloneTerminalOutcome>;
  onBack: () => void;
  onCompleted: (charge: CompletedStandaloneTerminal) => void;
  onPartiallyPaid: () => Promise<void>;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function StandaloneTerminalChargePanel({
  pending,
  charge,
  onBack,
  onCompleted,
  onPartiallyPaid,
  onSaleUnavailable,
  onSessionInvalid,
}: StandaloneTerminalChargePanelProps) {
  const [notice, setNotice] = useState<string>();
  const amountBox = useRef<HTMLDivElement>(null);
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
        case "paid_order_not_applied":
          setNotice(PAID_ORDER_NOT_APPLIED_MESSAGE);
          break;
        case "unavailable":
          setNotice(FAILED_MESSAGE);
          break;
      }
    },
  });

  useEffect(() => {
    amountBox.current?.querySelector("input")?.focus();
  }, []);

  function register() {
    setNotice(undefined);
    void submit();
  }

  useKeys([
    {
      key: "Escape",
      run: () => {
        if (!submitting) {
          onBack();
        }
      },
    },
  ]);
  useKeys([{ key: "Enter", run: register }], { fallback: true });

  return (
    <SidePanel
      label="Cobro con terminal independiente"
      width="wide"
      header={
        <SidePanelTitle
          icon={<Calculator />}
          title="Terminal independiente"
          onClose={submitting ? undefined : onBack}
        />
      }
      footer={
        <Button
          size="large"
          fullWidth
          icon={<Check />}
          iconPosition="start"
          keycap="Enter"
          dataStatus={submitting ? "loading" : "loaded"}
          onPress={register}
        >
          Registrar pago
        </Button>
      }
    >
      <FigureStat size="hero" label="A COBRAR" value={formatCents(pending)} />
      <div ref={amountBox}>
        <form.AppField name="amount" listeners={{ onChange: () => setNotice(undefined) }}>
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
        <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
      )}
    </SidePanel>
  );
}
