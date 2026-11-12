import type { ChargeSaleByTransferOutcome, NonCashChargeAnswer } from "@purosur/contracts";
import {
  Button,
  Card,
  FigureStat,
  fieldErrorMessage,
  formatAmountInput,
  formatCents,
  InlineNotice,
  parseAmountCents,
  SidePanel,
  SidePanelTitle,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { Check, Landmark, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { INVALID_AMOUNT_MESSAGE } from "./cash-charge-form";
import { chargeSaleByTransferRequestSchema, handChargeRequestFrom } from "./hand-charge-form";
import {
  CHARGE_IN_PROGRESS_MESSAGE,
  PAID_ORDER_NOT_APPLIED_MESSAGE,
} from "./mercado-pago-charge-messages";
import { useNonCashChargeQuery } from "./sales-queries";

const FAILED_MESSAGE = "No se pudo cobrar la venta. Probá de nuevo.";

function exceedsPendingMessage(pending: number): string {
  return `No puede superar el saldo pendiente de ${formatCents(pending)}.`;
}

export type CompletedTransfer = Extract<ChargeSaleByTransferOutcome, { kind: "completed" }> & {
  amount: number;
};

export type TransferChargePanelProps = {
  saleId: string;
  pending: number;
  readCharge: (amount: number) => Promise<NonCashChargeAnswer>;
  charge: (amount: number) => Promise<ChargeSaleByTransferOutcome>;
  onBack: () => void;
  onCompleted: (charge: CompletedTransfer) => void;
  onPartiallyPaid: () => Promise<void>;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function TransferChargePanel({
  saleId,
  pending,
  readCharge,
  charge,
  onBack,
  onCompleted,
  onPartiallyPaid,
  onSaleUnavailable,
  onSessionInvalid,
}: TransferChargePanelProps) {
  const [notice, setNotice] = useState<string>();
  const amountBox = useRef<HTMLDivElement>(null);
  const { form, submit, submitting, values } = useRequestForm({
    defaultValues: { amount: formatAmountInput(pending) },
    request: { schema: chargeSaleByTransferRequestSchema, from: handChargeRequestFrom },
    fields: { amount: "amount" },
    messages: { amount: INVALID_AMOUNT_MESSAGE },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await charge(request.amount).catch(
        (): ChargeSaleByTransferOutcome => ({ kind: "unavailable" }),
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

  const preview = useNonCashChargeQuery({
    saleId,
    pending,
    amount: parseAmountCents(values.amount),
    read: readCharge,
  });
  const answered = preview.status === "loaded" ? preview.value : undefined;
  const remaining =
    typeof answered === "object" && answered?.kind === "partial" ? answered.pending : undefined;

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
      label="Cobro por transferencia"
      width="wide"
      header={
        <SidePanelTitle
          icon={<Landmark />}
          title="Transferencia"
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
          Registrar transferencia
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
      {remaining === undefined ? null : (
        <Card variant="subtle">
          <FigureStat label="QUEDA" value={formatCents(remaining)} />
        </Card>
      )}
      {notice === undefined ? null : (
        <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
      )}
    </SidePanel>
  );
}
