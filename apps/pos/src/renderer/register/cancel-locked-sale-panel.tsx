import { ConfirmationPanel, formatCents, formatNumber } from "@purosur/ui";
import { Trash2 } from "lucide-react";
import { useKeys } from "../platform/key-layer";

export type CancelLockedSalePanelProps = {
  lineCount: number;
  total: number;
  busy: boolean;
  refusal?: string;
  onClose: () => void;
  onEmpty: () => void;
};

export function CancelLockedSalePanel({
  lineCount,
  total,
  busy,
  refusal,
  onClose,
  onEmpty,
}: CancelLockedSalePanelProps) {
  const refused = refusal !== undefined;

  useKeys([
    {
      key: "Escape",
      run: () => {
        if (!busy) {
          onClose();
        }
      },
    },
  ]);
  useKeys(
    [
      {
        key: "Enter",
        run: () => {
          if (!busy && !refused) {
            onEmpty();
          }
        },
      },
    ],
    { fallback: true },
  );

  return (
    <ConfirmationPanel
      title="¿Vaciar el carrito?"
      icon={<Trash2 />}
      tone="error"
      fieldLabel="VENTA ABIERTA · SIN PAGOS"
      value={formatCents(total)}
      details={[{ label: "Líneas en el carrito", value: formatNumber(lineCount) }]}
      actionLabel="Vaciar carrito"
      actionIcon={<Trash2 />}
      busy={busy}
      actionDisabled={refused}
      {...(refused ? { notice: refusal } : {})}
      onClose={onClose}
      onConfirm={onEmpty}
    />
  );
}
