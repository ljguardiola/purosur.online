import { Button, ElevatedPanel, InlineNotice } from "@purosur/ui";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useKeys } from "../platform/key-layer";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { registerEyebrow } from "../shell/register-eyebrow";

export function RestoreRequiredScreen({
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
          title="La caja tiene que volver a darse de alta"
          icon={<KeyRound />}
        >
          <InlineNotice
            tone="warning"
            icon={<KeyRound />}
            title="Pedí un código de alta"
            description="Un Administrador lo genera desde el backoffice. Las ventas guardadas en esta notebook se conservan."
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
