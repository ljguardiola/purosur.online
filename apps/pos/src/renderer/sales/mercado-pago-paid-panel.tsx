import type { Icon } from "@purosur/ui";
import {
  Button,
  FigureStat,
  formatCents,
  SidePanel,
  SidePanelTitle,
  SummaryRowGroup,
} from "@purosur/ui";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { useKeys } from "../platform/key-layer";

export type MercadoPagoPaidPanelProps = {
  icon: Icon;
  title: string;
  paidLabel: string;
  amount: number;
  pending: number | undefined;
  children?: ReactNode;
  onContinue: () => void;
};

export function MercadoPagoPaidPanel({
  icon,
  title,
  paidLabel,
  amount,
  pending,
  children,
  onContinue,
}: MercadoPagoPaidPanelProps) {
  useKeys([{ key: "Enter", run: onContinue }], { fallback: true });

  return (
    <SidePanel
      label={title}
      width="wide"
      header={<SidePanelTitle icon={icon} title={title} />}
      footer={
        <Button
          size="large"
          fullWidth
          icon={<ArrowRight />}
          iconPosition="start"
          keycap="Enter"
          onPress={onContinue}
        >
          Continuar
        </Button>
      }
    >
      <FigureStat size="hero" label="COBRADO" value={formatCents(amount)} />
      <SummaryRowGroup
        variant="plain"
        rows={[
          { label: paidLabel, value: formatCents(amount) },
          ...(pending === undefined
            ? []
            : [{ label: "Falta cobrar", value: formatCents(pending) }]),
        ]}
      />
      {children}
    </SidePanel>
  );
}
