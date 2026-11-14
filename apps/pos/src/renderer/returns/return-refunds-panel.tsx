import type { SummaryRowProps } from "@purosur/ui";
import { Button, formatCents, SidePanel, SummaryRowGroup } from "@purosur/ui";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { ReturnPanelFigure } from "./return-panel-figure";

export type ReturnRefundsPanelProps = {
  total: number;
  rows: readonly SummaryRowProps[];
  submitting: boolean;
  onFinish: () => void;
  children?: ReactNode;
};

export function ReturnRefundsPanel({
  total,
  rows,
  submitting,
  onFinish,
  children,
}: ReturnRefundsPanelProps) {
  const [first, ...rest] = rows;
  return (
    <SidePanel
      label="Reintegro por medio de pago"
      width="wide"
      header={<ReturnPanelFigure label="REINTEGRO" value={formatCents(total)} />}
      footer={
        <Button
          size="large"
          fullWidth
          icon={<Check />}
          iconPosition="start"
          keycap="Enter"
          disabled={submitting}
          dataStatus={submitting ? "loading" : "loaded"}
          onPress={onFinish}
        >
          Finalizar
        </Button>
      }
    >
      {first === undefined ? null : <SummaryRowGroup variant="divided" rows={[first, ...rest]} />}
      {children}
    </SidePanel>
  );
}
