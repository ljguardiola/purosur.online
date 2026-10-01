import { Button, formatCents, InlineNotice, plural, SummaryRowGroup } from "@purosur/ui";
import { Banknote, TriangleAlert } from "lucide-react";
import { Eyebrow } from "../shell/eyebrow";

export type PaymentPanelProps = {
  lineCount: number;
  total: number;
  onCharge: () => void;
};

export function PaymentPanel({ lineCount, total, onCharge }: PaymentPanelProps) {
  const lines = plural(lineCount, { one: "línea", other: "líneas" });
  const isZeroTotal = lineCount > 0 && total === 0;
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
        disabled={lineCount === 0 || isZeroTotal}
        onPress={onCharge}
      >
        Cobrar
      </Button>
      {isZeroTotal ? (
        <InlineNotice
          tone="warning"
          icon={<TriangleAlert />}
          title="El total es $ 0,00: quitá el producto o cancelá la venta."
        />
      ) : null}
    </aside>
  );
}
