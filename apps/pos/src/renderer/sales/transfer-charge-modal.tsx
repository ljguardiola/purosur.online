import type { ChargeSaleByTransferOutcome } from "@purosur/contracts";
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
import { ArrowLeft, Check, Landmark, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { INVALID_AMOUNT_MESSAGE } from "./cash-charge-form";
import {
  chargeSaleByTransferRequestSchema,
  transferChargeRequestFrom,
} from "./transfer-charge-form";

const FAILED_MESSAGE = "No se pudo cobrar la venta. Probá de nuevo.";

function exceedsPendingMessage(pending: number): string {
  return `No puede superar el saldo pendiente de ${formatCents(pending)}.`;
}

export type CompletedTransfer = Extract<ChargeSaleByTransferOutcome, { kind: "completed" }> & {
  amount: number;
};

export type TransferChargeModalProps = {
  total: number;
  paid: number;
  pending: number;
  charge: (amount: number) => Promise<ChargeSaleByTransferOutcome>;
  onChooseAnotherMethod: () => void;
  onCompleted: (charge: CompletedTransfer) => void;
  onPartiallyPaid: () => Promise<void>;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function TransferChargeModal({
  total,
  paid,
  pending,
  charge,
  onChooseAnotherMethod,
  onCompleted,
  onPartiallyPaid,
  onSaleUnavailable,
  onSessionInvalid,
}: TransferChargeModalProps) {
  const [notice, setNotice] = useState<string>();
  const { form, submit, submitting } = useRequestForm({
    defaultValues: { amount: formatAmountInput(pending) },
    request: { schema: chargeSaleByTransferRequestSchema, from: transferChargeRequestFrom },
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
        case "unavailable":
          setNotice(FAILED_MESSAGE);
          break;
      }
    },
  });

  function confirmCredit() {
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
      icon={<Landmark />}
      context="TRANSFERENCIA"
      contextTone="info"
      title="Esperando el ingreso en la cuenta"
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
            No llegó: cambiar de medio
          </Button>
          <Button
            size="large"
            fullWidth
            icon={<Check />}
            dataStatus={submitting ? "loading" : "loaded"}
            onPress={confirmCredit}
          >
            Vi el ingreso
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
        <form.AppField name="amount" listeners={{ onChange: () => setNotice(undefined) }}>
          {(field) => (
            <TextField
              kind="amount"
              prefix="$"
              label="Importe a cobrar con este medio"
              inputMode="numeric"
              value={field.state.value}
              onChange={field.handleChange}
              disabled={submitting}
              errorMessage={fieldErrorMessage(field.state.meta.errors)}
            />
          )}
        </form.AppField>
        <InlineNotice
          tone="warning"
          icon={<TriangleAlert />}
          title="No confirmes con la pantalla del cliente"
          description="Una captura falsa o una transferencia programada se ven igual que una real. Confirmá solo al ver el ingreso en el dispositivo del mostrador."
        />
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
