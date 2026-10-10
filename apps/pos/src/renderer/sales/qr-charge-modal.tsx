import type { StartMercadoPagoQrChargeOutcome } from "@purosur/contracts";
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
import { ArrowLeft, Info, QrCode, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { INVALID_AMOUNT_MESSAGE } from "./cash-charge-form";
import { qrChargeRequestFrom, startQrChargeRequestSchema } from "./qr-charge-form";

const REFUSED_MESSAGE = "Mercado Pago no pudo crear la orden. Cobrá con otro medio.";
const UNREACHABLE_MESSAGE =
  "No se pudo crear la orden porque la caja no llega a la nube. Cobrá con otro medio.";
const IN_PROGRESS_MESSAGE = "Ya hay un cobro con QR en curso para esta venta.";
const FAILED_MESSAGE = "No se pudo crear la orden. Probá de nuevo.";

function exceedsPendingMessage(pending: number): string {
  return `No puede superar el saldo pendiente de ${formatCents(pending)}.`;
}

export type ShownQrOrder = Extract<StartMercadoPagoQrChargeOutcome, { kind: "order_shown" }>;

export type QrChargeModalProps = {
  total: number;
  paid: number;
  pending: number;
  start: (amount: number) => Promise<StartMercadoPagoQrChargeOutcome>;
  onChooseAnotherMethod: () => void;
  onOrderShown: (order: ShownQrOrder) => void;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function QrChargeModal({
  total,
  paid,
  pending,
  start,
  onChooseAnotherMethod,
  onOrderShown,
  onSaleUnavailable,
  onSessionInvalid,
}: QrChargeModalProps) {
  const [notice, setNotice] = useState<string>();
  const { form, submit, submitting } = useRequestForm({
    defaultValues: { amount: formatAmountInput(pending) },
    request: { schema: startQrChargeRequestSchema, from: qrChargeRequestFrom },
    fields: { amount: "amount" },
    messages: { amount: INVALID_AMOUNT_MESSAGE },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await start(request.amount).catch(
        (): StartMercadoPagoQrChargeOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "order_shown":
          onOrderShown(outcome);
          break;
        case "exceeds_pending":
          showFieldError("amount", exceedsPendingMessage(outcome.pending));
          break;
        case "invalid_amount":
          showFieldError("amount", INVALID_AMOUNT_MESSAGE);
          break;
        case "order_refused":
          setNotice(REFUSED_MESSAGE);
          break;
        case "unreachable":
          setNotice(UNREACHABLE_MESSAGE);
          break;
        case "qr_charge_in_progress":
          setNotice(IN_PROGRESS_MESSAGE);
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

  function createOrder() {
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
      icon={<QrCode />}
      context="QR DE MERCADO PAGO"
      contextTone="info"
      title="¿Cuánto se cobra con QR?"
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
            icon={<QrCode />}
            dataStatus={submitting ? "loading" : "loaded"}
            onPress={createOrder}
          >
            Crear orden
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
              description="Si cobrás menos, el resto queda pendiente para otro medio."
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
          title="La orden se crea por este importe. Después ya no se puede cambiar."
        />
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
