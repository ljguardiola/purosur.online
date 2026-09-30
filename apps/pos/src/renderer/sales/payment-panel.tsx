import { plural, SummaryRowGroup } from "@purosur/ui";
import { Eyebrow } from "../shell/eyebrow";
import { formatCents } from "./format-cents";

export function PaymentPanel({ lineCount, total }: { lineCount: number; total: number }) {
  const lines = plural(lineCount, { one: "línea", other: "líneas" });
  return (
    <aside
      aria-label="Panel de cobro"
      className="flex h-full w-98 shrink-0 flex-col gap-4 border-l border-border bg-surface p-8"
    >
      <Eyebrow text="Total a cobrar" />
      <p className="text-display text-text-accent">{formatCents(total)}</p>
      <SummaryRowGroup rows={[{ label: `${lineCount} ${lines}`, value: formatCents(total) }]} />
    </aside>
  );
}
