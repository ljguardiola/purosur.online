import { Button, formatCents, SummaryRowGroup } from "@purosur/ui";
import { ArrowLeft } from "lucide-react";
import { Eyebrow } from "../shell/eyebrow";

export type ChargePaymentPanelProps = {
  total: number;
  paid: number;
  onBackToSale?: () => void;
};

export function ChargePaymentPanel({ total, paid, onBackToSale }: ChargePaymentPanelProps) {
  return (
    <aside
      aria-label="Panel de cobro"
      className="flex h-full w-98 shrink-0 flex-col gap-4 border-l border-border bg-surface p-8"
    >
      <Eyebrow text="Total a cobrar" />
      <p className="text-display text-text-accent">{formatCents(total)}</p>
      <SummaryRowGroup
        rows={[
          { label: "Pagado", value: formatCents(paid) },
          { label: "Saldo pendiente", value: formatCents(total - paid), strong: true },
        ]}
      />
      {onBackToSale === undefined ? null : (
        <Button variant="secondary" size="large" icon={<ArrowLeft />} onPress={onBackToSale}>
          Volver a la venta
        </Button>
      )}
    </aside>
  );
}
