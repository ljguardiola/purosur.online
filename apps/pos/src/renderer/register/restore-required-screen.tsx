import { Button, InlineNotice, ScreenHeader } from "@purosur/ui";
import { KeyRound } from "lucide-react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";

export function RestoreRequiredScreen({
  registerName,
  onEnroll,
}: {
  registerName: string | null;
  onEnroll: () => void;
}) {
  return (
    <BrandPanelScreen>
      <main className="flex w-full max-w-110 flex-col gap-4">
        <ScreenHeader
          eyebrow={registerName === null ? "CAJA" : registerName.toUpperCase()}
          title="La caja tiene que volver a darse de alta"
          description="Sus datos quedaron atrás de los de la nube, así que no puede vender hasta restaurarse."
        />
        <InlineNotice
          tone="warning"
          icon={<KeyRound />}
          title="Pedí un código de alta"
          description="Un Administrador lo genera desde el backoffice. Las ventas guardadas en esta notebook se conservan."
        />
        <Button fullWidth onPress={onEnroll}>
          Dar de alta la caja
        </Button>
      </main>
    </BrandPanelScreen>
  );
}
