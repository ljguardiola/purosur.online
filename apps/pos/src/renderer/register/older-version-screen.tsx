import { InlineNotice, ScreenHeader } from "@purosur/ui";
import { Download } from "lucide-react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";

export function OlderVersionScreen() {
  return (
    <BrandPanelScreen>
      <main className="flex w-full max-w-110 flex-col gap-4">
        <ScreenHeader
          title="Hay que instalar la versión vigente"
          description="Esta versión de la caja es anterior a la base de datos, así que no puede abrirla."
        />
        <InlineNotice
          tone="info"
          icon={<Download />}
          title="Instalando la versión vigente"
          description="Se descarga sola si hay internet y la caja arranca al terminar. Si no hay internet, avisá al Administrador."
        />
      </main>
    </BrandPanelScreen>
  );
}
