import { formatCents } from "@purosur/ui";
import { differenceText } from "./cash-amounts";

const UNKNOWN = "—";

export type CashCountStripProps = {
  expected: number | undefined;
  counted: number | undefined;
  difference: number | undefined;
};

function Cell({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <dt className="text-caption text-text-subtle">{label}</dt>
      <dd className="text-heading font-bold text-text">{text}</dd>
    </div>
  );
}

export function CashCountStrip({ expected, counted, difference }: CashCountStripProps) {
  return (
    <dl className="flex gap-4 rounded-lg bg-surface-subtle p-4">
      <Cell label="Esperado" text={expected === undefined ? UNKNOWN : formatCents(expected)} />
      <Cell label="Contado" text={counted === undefined ? UNKNOWN : formatCents(counted)} />
      <Cell
        label="Diferencia"
        text={difference === undefined ? UNKNOWN : differenceText(difference)}
      />
    </dl>
  );
}
