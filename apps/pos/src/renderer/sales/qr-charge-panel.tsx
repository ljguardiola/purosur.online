import type { StartMercadoPagoChargeOutcome } from "@purosur/contracts";
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
import { ArrowRight, Info, QrCode, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { INVALID_AMOUNT_MESSAGE } from "./cash-charge-form";
import {
  mercadoPagoChargeRequestFrom,
  mercadoPagoChargeRequestSchema,
} from "./mercado-pago-charge-form";
import {
  CHARGE_IN_PROGRESS_MESSAGE,
  exceedsPendingMessage,
  ORDER_FAILED_MESSAGE,
  ORDER_UNREACHABLE_MESSAGE,
  PAID_ORDER_NOT_APPLIED_MESSAGE,
} from "./mercado-pago-charge-messages";

const REFUSED_MESSAGE = "Mercado Pago no pudo crear la orden. Cobrá con otro medio.";

export type ShownQrOrder = Extract<StartMercadoPagoChargeOutcome, { kind: "order_shown" }>;

export type QrChargePanelProps = {
  pending: number;
  minimum: number;
  regenerate?: number;
  start: (amount: number) => Promise<StartMercadoPagoChargeOutcome>;
  onChooseAnotherMethod: () => void;
  onOrderShown: (order: ShownQrOrder) => void;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

function focusInput(box: HTMLElement | null) {
  box?.querySelector("input")?.focus();
}

export function QrChargePanel({
  pending,
  minimum,
  regenerate,
  start,
  onChooseAnotherMethod,
  onOrderShown,
  onSaleUnavailable,
  onSessionInvalid,
}: QrChargePanelProps) {
  const [notice, setNotice] = useState<string>();
  const amountBox = useRef<HTMLDivElement>(null);
  const regenerated = useRef(false);
  const { form, submit, submitting } = useRequestForm({
    defaultValues: { amount: formatAmountInput(regenerate ?? pending) },
    request: { schema: mercadoPagoChargeRequestSchema, from: mercadoPagoChargeRequestFrom },
    fields: { amount: "amount" },
    messages: { amount: INVALID_AMOUNT_MESSAGE },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await start(request.amount).catch(
        (): StartMercadoPagoChargeOutcome => ({ kind: "unavailable" }),
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
        case "below_minimum":
          setNotice(`El QR no acepta cobros menores a ${formatCents(minimum)}`);
          break;
        case "order_refused":
          setNotice(REFUSED_MESSAGE);
          break;
        case "unreachable":
          setNotice(ORDER_UNREACHABLE_MESSAGE);
          break;
        case "mercado_pago_charge_in_progress":
          setNotice(CHARGE_IN_PROGRESS_MESSAGE);
          break;
        case "paid_order_not_applied":
          setNotice(PAID_ORDER_NOT_APPLIED_MESSAGE);
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
          setNotice(ORDER_FAILED_MESSAGE);
          break;
      }
    },
  });

  function createOrder() {
    if (submitting) {
      return;
    }
    setNotice(undefined);
    void submit();
  }

  const createRegeneratedOrder = useEffectEvent(createOrder);

  useEffect(() => {
    if (regenerate === undefined) {
      focusInput(amountBox.current);
    } else if (!regenerated.current) {
      regenerated.current = true;
      createRegeneratedOrder();
    }
  }, [regenerate]);

  const leaving = notice !== undefined;

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
  useKeys([{ key: "Enter", run: leaving ? onChooseAnotherMethod : createOrder }], {
    fallback: true,
  });

  return (
    <SidePanel
      label="Cobro con QR"
      width="wide"
      header={
        <SidePanelTitle
          icon={<QrCode />}
          title="QR"
          closeLabel="Cambiar de medio"
          closeDisabled={submitting}
          onClose={onChooseAnotherMethod}
        />
      }
      footer={
        leaving ? (
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
            icon={<QrCode />}
            iconPosition="start"
            keycap="Enter"
            dataStatus={submitting ? "loading" : "loaded"}
            onPress={createOrder}
          >
            Crear orden
          </Button>
        )
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
      <InlineNotice
        tone="info"
        icon={<Info />}
        title="La orden se crea por este importe. Después ya no se puede cambiar."
      />
      {notice === undefined ? null : (
        <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
      )}
    </SidePanel>
  );
}
