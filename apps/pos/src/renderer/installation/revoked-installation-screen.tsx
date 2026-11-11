import { Button, ElevatedPanel, InlineNotice } from "@purosur/ui";
import { Ban, ShieldCheck } from "lucide-react";
import { useKeys } from "../platform/key-layer";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { registerEyebrow } from "../shell/register-eyebrow";

export function RevokedInstallationScreen({
  registerName,
  version,
  onEnroll,
}: {
  registerName: string | null;
  version: string | null;
  onEnroll: () => void;
}) {
  useKeys([{ key: "Enter", run: onEnroll }]);

  return (
    <BrandPanelScreen version={version}>
      <main className="w-full max-w-110">
        <ElevatedPanel
          eyebrow={registerEyebrow(registerName)}
          title={
            registerName === null
              ? "Esta notebook dejó de ser una caja"
              : `Esta notebook ya no es la ${registerName}`
          }
          icon={<Ban />}
          tone="error"
        >
          <InlineNotice
            tone="error"
            icon={<Ban />}
            title="No se pueden abrir ventas"
            description="Las ventas guardadas en esta notebook se conservan. Para volver a vender, pedí al Administrador un código de alta."
          />
          <Button
            size="large"
            fullWidth
            icon={<ShieldCheck />}
            iconPosition="start"
            keycap="Enter"
            onPress={onEnroll}
          >
            Dar de alta la caja
          </Button>
        </ElevatedPanel>
      </main>
    </BrandPanelScreen>
  );
}
