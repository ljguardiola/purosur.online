import { ConfirmationPanel, formatCents, formatNumber } from "@purosur/ui";
import { Trash2 } from "lucide-react";
import { useKeys } from "../platform/key-layer";

export type EmptySalePanelProps = {
  lineCount: number;
  total: number;
  busy: boolean;
  onClose: () => void;
  onEmpty: () => void;
};

export function EmptySalePanel({ lineCount, total, busy, onClose, onEmpty }: EmptySalePanelProps) {
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
          if (!busy) {
            onEmpty();
          }
        },
      },
    ],
    { fallback: true },
  );
  return (
    <ConfirmationPanel
      title="Vaciar venta"
      icon={<Trash2 />}
      tone="error"
      fieldLabel="TOTAL"
      value={formatCents(total)}
      details={[{ label: "Artículos", value: formatNumber(lineCount) }]}
      actionLabel="Vaciar venta"
      actionIcon={<Trash2 />}
      busy={busy}
      onClose={onClose}
      onConfirm={onEmpty}
    />
  );
}
