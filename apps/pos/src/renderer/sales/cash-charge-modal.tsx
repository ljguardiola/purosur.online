import type { CashChargeAnswer, ChargeSaleInCashOutcome } from "@purosur/contracts";
import {
  Button,
  formatCents,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  parseAmountCents,
  SummaryRowGroup,
  TextField,
} from "@purosur/ui";
import { ArrowLeft, Banknote, Check, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Eyebrow } from "../shell/eyebrow";
import { useCashChargeQuery } from "./sales-queries";

const INVALID_AMOUNT_MESSAGE = "Ingresá un importe válido, por ejemplo 5.000,00.";
const FAILED_MESSAGE = "No se pudo cobrar la venta. Probá de nuevo.";

function coverMessage(amount: number): string {
  return `Tiene que cubrir ${formatCents(amount)}.`;
}

export type CompletedCharge = Extract<ChargeSaleInCashOutcome, { kind: "completed" }>;

export type CashChargeModalProps = {
  saleId: string;
  total: number;
  readCharge: (tendered: number) => Promise<CashChargeAnswer>;
  charge: (tendered: number) => Promise<ChargeSaleInCashOutcome>;
  onChooseAnotherMethod: () => void;
  onCompleted: (charge: CompletedCharge) => void;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function CashChargeModal({
  saleId,
  total,
  readCharge,
  charge,
  onChooseAnotherMethod,
  onCompleted,
  onSaleUnavailable,
  onSessionInvalid,
}: CashChargeModalProps) {
  const content = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState("");
  const [refusal, setRefusal] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    content.current?.querySelector("input")?.focus();
  }, []);

  const isBlank = typed.trim() === "";
  const tendered = isBlank ? undefined : parseAmountCents(typed);
  const answer = useCashChargeQuery({ saleId, total, tendered, read: readCharge });
  const loaded = answer.status === "loaded" ? answer : undefined;
  const answered =
    loaded === undefined || loaded.value === null || loaded.value === "not_permitted"
      ? undefined
      : loaded.value;
  const saleUnavailable = loaded !== undefined && answered === undefined;
  const fieldMessage =
    refusal ??
    (!isBlank && (tendered === undefined || answered?.kind === "invalid_amount")
      ? INVALID_AMOUNT_MESSAGE
      : undefined);
  const covered =
    tendered !== undefined && answered?.kind === "covered" && !loaded?.refreshing
      ? { tendered, ...answered }
      : undefined;

  useEffect(() => {
    if (saleUnavailable) {
      onSaleUnavailable();
    }
  }, [saleUnavailable, onSaleUnavailable]);

  function type(value: string) {
    setTyped(value);
    setRefusal(undefined);
    setNotice(undefined);
  }

  async function submit() {
    if (submitting || covered === undefined) {
      return;
    }
    setNotice(undefined);
    setSubmitting(true);
    const outcome = await charge(covered.tendered).catch(
      (): ChargeSaleInCashOutcome => ({ kind: "unavailable" }),
    );
    setSubmitting(false);
    switch (outcome.kind) {
      case "completed":
        onCompleted(outcome);
        break;
      case "insufficient_cash":
        setRefusal(coverMessage(outcome.amount_due));
        break;
      case "invalid_amount":
        setRefusal(INVALID_AMOUNT_MESSAGE);
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
            disabled={covered === undefined}
            onPress={() => void submit()}
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
        <TextField
          kind="amount"
          prefix="$"
          label="Importe entregado por el cliente"
          inputMode="numeric"
          value={typed}
          onChange={type}
          disabled={submitting}
          description={coverMessage(total)}
          errorMessage={fieldMessage}
        />
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
