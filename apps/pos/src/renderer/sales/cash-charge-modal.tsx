import type { ChargeSaleInCashOutcome } from "@purosur/contracts";
import { cashCharge, chargeSaleInCashRequestSchema, parseAmountCents } from "@purosur/contracts";
import {
  Button,
  fieldErrorMessage,
  formatCents,
  InlineNotice,
  Modal,
  SummaryRowGroup,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { ArrowLeft, Banknote, Check, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Eyebrow } from "../shell/eyebrow";
import {
  cashChargeRequestFrom,
  EMPTY_CASH_CHARGE_FORM,
  INVALID_AMOUNT_MESSAGE,
} from "./cash-charge-form";

const FAILED_MESSAGE = "No se pudo cobrar la venta. Probá de nuevo.";

function coverMessage(amount: number): string {
  return `Tiene que cubrir ${formatCents(amount)}.`;
}

export type CompletedCharge = Extract<ChargeSaleInCashOutcome, { kind: "completed" }>;

export type CashChargeModalProps = {
  total: number;
  charge: (tendered: number) => Promise<ChargeSaleInCashOutcome>;
  onChooseAnotherMethod: () => void;
  onCompleted: (charge: CompletedCharge) => void;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function CashChargeModal({
  total,
  charge,
  onChooseAnotherMethod,
  onCompleted,
  onSaleUnavailable,
  onSessionInvalid,
}: CashChargeModalProps) {
  const content = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<string>();
  const { form, submit, submitting, values } = useRequestForm({
    defaultValues: EMPTY_CASH_CHARGE_FORM,
    request: { schema: chargeSaleInCashRequestSchema, from: cashChargeRequestFrom },
    fields: { tendered: "tendered" },
    messages: { tendered: INVALID_AMOUNT_MESSAGE },
    onSubmit: async (request, { showFieldError }) => {
      const outcome = await charge(request.tendered).catch(
        (): ChargeSaleInCashOutcome => ({ kind: "unavailable" }),
      );
      switch (outcome.kind) {
        case "completed":
          onCompleted(outcome);
          break;
        case "insufficient_cash":
          showFieldError("tendered", coverMessage(outcome.amount_due));
          break;
        case "invalid_amount":
          showFieldError("tendered", INVALID_AMOUNT_MESSAGE);
          break;
        case "empty_sale":
        case "zero_total":
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

  useEffect(() => {
    content.current?.querySelector("input")?.focus();
  }, []);

  const isBlank = values.tendered.trim() === "";
  const tendered = isBlank ? undefined : parseAmountCents(values.tendered);
  const result =
    tendered === undefined ? { kind: "invalid_amount" as const } : cashCharge(total, tendered);
  const typedMessage =
    !isBlank && result.kind === "invalid_amount" ? INVALID_AMOUNT_MESSAGE : undefined;
  const covered =
    tendered !== undefined && result.kind === "covered" ? { tendered, ...result } : undefined;

  function handleSubmit() {
    if (submitting || covered === undefined) {
      return;
    }
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
      icon={<Banknote />}
      context="COBRO EN EFECTIVO"
      contextTone="info"
      title="Ingresá el importe entregado"
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
            disabled={covered === undefined}
            onPress={handleSubmit}
          >
            Completar venta
          </Button>
        </>
      }
    >
      <div ref={content} className="flex flex-col gap-5">
        <SummaryRowGroup
          rows={[
            { label: "Total de la venta", value: formatCents(total) },
            { label: "Pagado", value: formatCents(0) },
            { label: "A cobrar ahora", value: formatCents(total) },
          ]}
        />
        <form.AppField name="tendered" listeners={{ onChange: () => setNotice(undefined) }}>
          {(field) => (
            <TextField
              kind="amount"
              prefix="$"
              label="Importe entregado por el cliente"
              inputMode="numeric"
              value={field.state.value}
              onChange={field.handleChange}
              disabled={submitting}
              description={coverMessage(total)}
              errorMessage={fieldErrorMessage(field.state.meta.errors) ?? typedMessage}
            />
          )}
        </form.AppField>
        {covered === undefined ? null : (
          <div className="flex flex-col gap-1 rounded-lg bg-surface-subtle p-4">
            <Eyebrow text="VUELTO A ENTREGAR" />
            <p className="text-detail text-text-subtle">{`${formatCents(covered.tendered)} − ${formatCents(covered.applied)}`}</p>
            <p className="text-display text-text-accent">{formatCents(covered.change)}</p>
          </div>
        )}
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
