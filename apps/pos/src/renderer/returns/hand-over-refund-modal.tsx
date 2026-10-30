import { Button, Eyebrow, FigureStat, formatCents, Modal, Tag } from "@purosur/ui";
import { Check, CircleCheck, Undo2 } from "lucide-react";
import { pendingRefundPresentation } from "../platform/pending-refund-text";
import type { ReturnDispositionValue } from "./return-text";
import { dispositionOutcomeText } from "./return-text";

export type CompletedReturnLine = {
  id: string;
  name: string;
  quantity: string;
  disposition: ReturnDispositionValue;
  amount: number;
};

export type PendingReturnRefund = {
  id: string;
  name: string;
  amount: number;
  sentByCloud: boolean;
};

export type CompletedReturn = {
  cashToHandOver: number;
  pendingRefunds: readonly PendingReturnRefund[];
  lines: readonly CompletedReturnLine[];
};

export type HandOverRefundModalProps = CompletedReturn & { onDone: () => void };

export function HandOverRefundModal({
  cashToHandOver,
  pendingRefunds,
  lines,
  onDone,
}: HandOverRefundModalProps) {
  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) {
          onDone();
        }
      }}
      width="standard"
      tone="success"
      icon={<CircleCheck />}
      context="DEVOLUCIÓN COMPLETADA"
      title={cashToHandOver > 0 ? "Entregá el dinero al cliente" : "El reintegro queda pendiente"}
      footer={
        <Button size="large" icon={<Check />} fullWidth onPress={onDone}>
          Listo
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {cashToHandOver > 0 ? (
          <div className="rounded-lg bg-success-subtle px-5 py-4">
            <FigureStat
              label="DEVOLVÉ EN EFECTIVO"
              detail="Por el pago en efectivo"
              value={formatCents(cashToHandOver)}
            />
          </div>
        ) : null}
        {pendingRefunds.length > 0 ? (
          <div className="flex flex-col gap-3">
            <Eyebrow text="REEMBOLSOS PENDIENTES · CADA PAGO VUELVE POR SU MEDIO" />
            <ul className="flex flex-col gap-3">
              {pendingRefunds.map((refund) => {
                const { description, chip } = pendingRefundPresentation(refund.sentByCloud);
                return (
                  <li key={refund.id} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-body font-bold text-text">
                        {`${refund.name} · ${formatCents(refund.amount)}`}
                      </span>
                      <Tag tone={chip.tone}>{chip.label}</Tag>
                    </div>
                    <p className="text-detail text-text-subtle">{description}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {lines.map((line) => (
            <li key={line.id} className="flex items-center gap-3 px-4 py-3">
              <Undo2 aria-hidden className="size-icon-md shrink-0 text-text-accent" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-bold text-text">{`${line.name} · ${line.quantity}`}</span>
                <span className="text-detail text-text-subtle">
                  {`Reintegro · ${dispositionOutcomeText(line.disposition)}`}
                </span>
              </div>
              <span className="text-body font-bold text-text">{formatCents(line.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
