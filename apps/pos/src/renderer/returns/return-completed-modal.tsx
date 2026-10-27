import { Button, FigureStat, formatCents, Modal } from "@purosur/ui";
import { Check, CircleCheck, Undo2 } from "lucide-react";
import type { ReturnDispositionValue } from "./return-text";
import { dispositionOutcomeText } from "./return-text";

export type CompletedReturnLine = {
  id: string;
  name: string;
  quantity: string;
  disposition: ReturnDispositionValue;
  amount: number;
};

export type ReturnCompletedModalProps = {
  refundedTotal: number;
  lines: readonly CompletedReturnLine[];
  onDone: () => void;
};

export function ReturnCompletedModal({ refundedTotal, lines, onDone }: ReturnCompletedModalProps) {
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
      title="Entregá el dinero al cliente"
      footer={
        <Button size="large" icon={<Check />} fullWidth onPress={onDone}>
          Listo
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-lg bg-success-subtle px-5 py-4">
          <FigureStat
            label="DEVOLVÉ EN EFECTIVO"
            detail="Por el pago en efectivo"
            value={formatCents(refundedTotal)}
          />
        </div>
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
