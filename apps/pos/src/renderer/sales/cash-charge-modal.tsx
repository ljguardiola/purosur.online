import type { CashChargeAnswer, ChargeSaleInCashOutcome } from "@purosur/contracts";
import {
  Button,
  Card,
  FigureStat,
  fieldErrorMessage,
  formatCents,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  parseAmountCents,
  SummaryRowGroup,
  TextField,
  useRequestForm,
} from "@purosur/ui";
import { ArrowLeft, Banknote, Check, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  cashChargeRequestFrom,
  chargeSaleInCashRequestSchema,
  EMPTY_CASH_CHARGE_FORM,
  INVALID_AMOUNT_MESSAGE,
} from "./cash-charge-form";
import { useCashChargeQuery } from "./sales-queries";

const FAILED_MESSAGE = "No se pudo cobrar la venta. Probá de nuevo.";

const PARTIAL_PAYMENT_HINT = "Con menos de lo que falta, el resto queda pendiente.";

export type CompletedCharge = Extract<ChargeSaleInCashOutcome, { kind: "completed" }>;

export type CashChargeModalProps = {
  saleId: string;
  total: number;
  paid: number;
  pending: number;
  readCharge: (tendered: number) => Promise<CashChargeAnswer>;
  charge: (tendered: number) => Promise<ChargeSaleInCashOutcome>;
  onChooseAnotherMethod: () => void;
  onCompleted: (charge: CompletedCharge) => void;
  onPartiallyPaid: () => void;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function CashChargeModal({
  saleId,
  total,
  paid,
  pending,
  readCharge,
  charge,
  onChooseAnotherMethod,
  onCompleted,
  onPartiallyPaid,
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
        case "partially_paid":
          onPartiallyPaid();
          break;
        case "invalid_amount":
          showFieldError("tendered", INVALID_AMOUNT_MESSAGE);
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

  useEffect(() => {
    content.current?.querySelector("input")?.focus();
  }, []);

  const isBlank = values.tendered.trim() === "";
  const tendered = isBlank ? undefined : parseAmountCents(values.tendered);
  const answer = useCashChargeQuery({ saleId, pending, tendered, read: readCharge });
  const loaded = answer.status === "loaded" ? answer : undefined;
  const answered =
    loaded === undefined || loaded.value === null || loaded.value === "not_permitted"
      ? undefined
      : loaded.value;
  const saleUnavailable = loaded !== undefined && answered === undefined;
  const answeredMessage =
    tendered !== undefined && answered?.kind === "invalid_amount"
      ? INVALID_AMOUNT_MESSAGE
      : undefined;
  const covered =
    tendered !== undefined && answered?.kind === "covered" && !loaded?.refreshing
      ? { tendered, ...answered }
      : undefined;
  const partial =
    tendered !== undefined && answered?.kind === "partial" && !loaded?.refreshing
      ? answered
      : undefined;

  useEffect(() => {
    if (saleUnavailable) {
      onSaleUnavailable();
    }
  }, [saleUnavailable, onSaleUnavailable]);

  function tenderedMessage(typed: string): string | undefined {
    return typed.trim() !== "" && parseAmountCents(typed) === undefined
      ? INVALID_AMOUNT_MESSAGE
      : undefined;
  }

  function handleSubmit() {
    if (submitting || (covered === undefined && partial === undefined)) {
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
            dataStatus={submitting ? "loading" : answer.status}
            disabled={covered === undefined && partial === undefined}
            onPress={handleSubmit}
          >
            {partial === undefined ? "Completar venta" : "Registrar pago parcial"}
          </Button>
        </>
      }
    >
      <div ref={content} className="flex flex-col gap-5">
        <SummaryRowGroup
          rows={[
            { label: "Total de la venta", value: formatCents(total) },
            { label: "Pagado", value: formatCents(paid) },
            { label: "A cobrar ahora", value: formatCents(pending) },
          ]}
        />
        <form.AppField
          name="tendered"
          validators={{ onChange: ({ value }) => tenderedMessage(value) }}
          listeners={{ onChange: () => setNotice(undefined) }}
        >
          {(field) => (
            <TextField
              kind="amount"
              prefix="$"
              label="Importe entregado por el cliente"
              inputMode="numeric"
              value={field.state.value}
              onChange={field.handleChange}
              disabled={submitting}
              description={PARTIAL_PAYMENT_HINT}
              errorMessage={fieldErrorMessage(field.state.meta.errors) ?? answeredMessage}
            />
          )}
        </form.AppField>
        {tendered !== undefined && answer.status === "loading" ? (
          <LoadingPlaceholder variant="card" lines={2} />
        ) : null}
        {answer.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo calcular el vuelto"
            description="Volvé a intentarlo en unos segundos."
            onRetry={answer.retry}
          />
        ) : null}
        {covered === undefined ? null : (
          <Card variant="subtle">
            <FigureStat
              label="VUELTO A ENTREGAR"
              detail={`${formatCents(covered.tendered)} − ${formatCents(covered.applied)}`}
              value={formatCents(covered.change)}
            />
          </Card>
        )}
        {partial === undefined ? null : (
          <Card variant="subtle">
            <FigureStat
              label="QUEDA PENDIENTE"
              detail={`${formatCents(pending)} − ${formatCents(partial.applied)}`}
              value={formatCents(partial.pending)}
            />
          </Card>
        )}
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
