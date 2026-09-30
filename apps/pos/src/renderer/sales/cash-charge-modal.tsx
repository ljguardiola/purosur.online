import type { ChargeSaleInCashOutcome } from "@purosur/contracts";
import { parseAmountCents } from "@purosur/contracts";
import { Button, formatCents, InlineNotice, Modal, SummaryRowGroup, TextField } from "@purosur/ui";
import { ArrowLeft, Banknote, Check, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Eyebrow } from "../shell/eyebrow";

const INVALID_AMOUNT_MESSAGE = "Ingresá un importe válido, por ejemplo 5.000,00.";
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
  const form = useRef<HTMLFormElement>(null);
  const [typed, setTyped] = useState("");
  const [refusal, setRefusal] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    form.current?.querySelector("input")?.focus();
  }, []);

  const isBlank = typed.trim() === "";
  const tendered = isBlank ? undefined : parseAmountCents(typed);
  const fieldMessage =
    refusal ?? (!isBlank && tendered === undefined ? INVALID_AMOUNT_MESSAGE : undefined);
  const covering = tendered !== undefined && tendered >= total ? tendered : undefined;

  function type(value: string) {
    setTyped(value);
    setRefusal(undefined);
    setNotice(undefined);
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (submitting || covering === undefined) {
      return;
    }
    setNotice(undefined);
    setSubmitting(true);
    const outcome = await charge(covering).catch(
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
            dataStatus={submitting ? "loading" : "loaded"}
            disabled={covering === undefined}
            onPress={() => void submit()}
          >
            Completar venta
          </Button>
        </>
      }
    >
      <form ref={form} noValidate className="flex flex-col gap-5" onSubmit={submit}>
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
        {covering === undefined ? null : (
          <div className="flex flex-col gap-1 rounded-lg bg-surface-subtle p-4">
            <Eyebrow text="VUELTO A ENTREGAR" />
            <p className="text-detail text-text-subtle">{`${formatCents(covering)} − ${formatCents(total)}`}</p>
            <p className="text-display text-text-accent">{formatCents(covering - total)}</p>
          </div>
        )}
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </form>
    </Modal>
  );
}
