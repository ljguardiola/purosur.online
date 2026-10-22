import type { SalesStopReason } from "@purosur/domain";
import { Button, InlineNotice, ScreenHeader } from "@purosur/ui";
import { Ban } from "lucide-react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { registerEyebrow } from "./register-eyebrow";

export function RevokedInstallationScreen({
  registerName,
  reason,
  onEnroll,
}: {
  registerName: string | null;
  reason: SalesStopReason | null;
  onEnroll: () => void;
}) {
  return (
    <BrandPanelScreen>
      <main className="flex w-full max-w-110 flex-col gap-4">
        <ScreenHeader
          eyebrow={registerEyebrow(registerName)}
          title={
            registerName === null
              ? "Esta notebook dejó de ser una caja"
              : `Esta notebook ya no es la ${registerName}`
          }
          description={
            reason === "event_history_broken"
              ? "La nube encontró un problema en el registro de operaciones de esta notebook y la dio de baja."
              : "La caja se dio de alta en otra notebook, o se la dio de baja desde el backoffice."
          }
        />
        <InlineNotice
          tone="error"
          icon={<Ban />}
          title="No se pueden abrir ventas"
          description="Las ventas guardadas en esta notebook se conservan. Para volver a vender, pedí al Administrador un código de alta."
        />
        <Button fullWidth onPress={onEnroll}>
          Dar de alta la caja
        </Button>
      </main>
    </BrandPanelScreen>
  );
}
