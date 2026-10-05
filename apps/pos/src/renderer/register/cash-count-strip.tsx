import { Card, FigureStat, formatCents } from "@purosur/ui";
import { differenceText } from "./cash-amounts";

const UNKNOWN = "—";

export type CashCountStripProps = {
  expected: number | undefined;
  counted: number | undefined;
  difference: number | undefined;
};

export function CashCountStrip({ expected, counted, difference }: CashCountStripProps) {
  return (
    <Card variant="subtle">
      <div className="grid grid-cols-3 gap-4">
        <FigureStat
          size="heading"
          label="Esperado"
          value={expected === undefined ? UNKNOWN : formatCents(expected)}
        />
        <FigureStat
          size="heading"
          label="Contado"
          value={counted === undefined ? UNKNOWN : formatCents(counted)}
        />
        <FigureStat
          size="heading"
          label="Diferencia"
          value={difference === undefined ? UNKNOWN : differenceText(difference)}
        />
      </div>
    </Card>
  );
}
