import { FigureStat, formatCents, KeyOptionCard, SidePanel, SidePanelTitle } from "@purosur/ui";
import { Calculator, Ellipsis, Landmark } from "lucide-react";
import type { ReactNode } from "react";
import { useKeys } from "../platform/key-layer";

type OtherChargeMethod = "TRANSFER" | "STANDALONE_TERMINAL";

export type OtherChargeMethodsPanelProps = {
  pending: number;
  paidOrderNotice: ReactNode;
  onBack: () => void;
  onChoose: (method: OtherChargeMethod) => void;
};

export function OtherChargeMethodsPanel({
  pending,
  paidOrderNotice,
  onBack,
  onChoose,
}: OtherChargeMethodsPanelProps) {
  useKeys([
    { key: "Escape", run: onBack },
    { key: "1", run: () => onChoose("TRANSFER") },
    { key: "2", run: () => onChoose("STANDALONE_TERMINAL") },
  ]);

  return (
    <SidePanel
      label="Otros medios"
      width="wide"
      header={<SidePanelTitle icon={<Ellipsis />} title="Otros medios" onClose={onBack} />}
    >
      <FigureStat size="hero" label="A COBRAR" value={formatCents(pending)} />
      {paidOrderNotice}
      <KeyOptionCard
        label="Transferencia"
        icon={<Landmark />}
        keyName="1"
        onPress={() => onChoose("TRANSFER")}
      />
      <KeyOptionCard
        label="Terminal independiente"
        icon={<Calculator />}
        keyName="2"
        onPress={() => onChoose("STANDALONE_TERMINAL")}
      />
    </SidePanel>
  );
}
