import { Button, FigureStat, formatCents, SidePanel, SummaryRowGroup } from "@purosur/ui";
import { ArrowLeft } from "lucide-react";

export type ChargePaymentPanelProps = {
  total: number;
  paid: number;
  onBackToSale?: () => void;
};

export function ChargePaymentPanel({ total, paid, onBackToSale }: ChargePaymentPanelProps) {
  return (
    <SidePanel label="Panel de cobro">
      <FigureStat label="Total a cobrar" value={formatCents(total)} />
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
    </SidePanel>
  );
}
