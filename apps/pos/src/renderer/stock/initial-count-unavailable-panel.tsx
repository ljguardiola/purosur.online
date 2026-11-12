import { Button, SidePanel, SidePanelTitle } from "@purosur/ui";
import { ArrowLeft, Package } from "lucide-react";

export function InitialCountUnavailablePanel({ onGoHome }: { onGoHome: () => void }) {
  return (
    <SidePanel
      width="wide"
      label="Inventario inicial"
      header={<SidePanelTitle icon={<Package />} title="Inventario inicial" onClose={onGoHome} />}
      footer={
        <Button
          size="large"
          fullWidth
          icon={<ArrowLeft />}
          iconPosition="start"
          keycap="Enter"
          onPress={onGoHome}
        >
          Volver al inicio
        </Button>
      }
    >
      {null}
    </SidePanel>
  );
}
