import { ElevatedPanel, InlineNotice } from "@purosur/ui";
import { Download } from "lucide-react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";

export function OlderVersionScreen({ version }: { version: string | null }) {
  return (
    <BrandPanelScreen version={version}>
      <main className="w-full max-w-110">
        <ElevatedPanel tone="info" icon={<Download />} title="Hay que instalar la versión vigente">
          <InlineNotice
            tone="info"
            icon={<Download />}
            title="Instalando la versión vigente"
            description="Se descarga sola si hay internet y la caja arranca al terminar. Si no hay internet, avisá al Administrador."
          />
        </ElevatedPanel>
      </main>
    </BrandPanelScreen>
  );
}
