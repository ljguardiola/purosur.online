import { Button, formatCents, plural, SummaryRowGroup } from "@purosur/ui";
import { Banknote } from "lucide-react";
import { Eyebrow } from "../shell/eyebrow";

export type PaymentPanelProps = {
  lineCount: number;
  total: number;
  onCharge: () => void;
};

export function PaymentPanel({ lineCount, total, onCharge }: PaymentPanelProps) {
  const lines = plural(lineCount, { one: "línea", other: "líneas" });
  return (
    <aside
      aria-label="Panel de cobro"
      className="flex h-full w-98 shrink-0 flex-col gap-4 border-l border-border bg-surface p-8"
    >
      <Eyebrow text="Total a cobrar" />
      <p className="text-display text-text-accent">{formatCents(total)}</p>
      <SummaryRowGroup rows={[{ label: `${lineCount} ${lines}`, value: formatCents(total) }]} />
      <Button
        size="sale"
        fullWidth
        icon={<Banknote />}
        disabled={lineCount === 0}
        onPress={onCharge}
      >
        Cobrar
      </Button>
    </aside>
  );
}
