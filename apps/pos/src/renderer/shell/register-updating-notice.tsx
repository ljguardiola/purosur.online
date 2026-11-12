import { ElevatedPanel, InlineNotice } from "@purosur/ui";
import { RefreshCw } from "lucide-react";
import { BrandPanelScreen } from "./brand-panel-screen";

export function RegisterUpdatingNotice({ version }: { version: string | null }) {
  return (
    <BrandPanelScreen version={version}>
      <main className="w-full max-w-110">
        <ElevatedPanel tone="info" icon={<RefreshCw />} title="Actualizando la caja">
          <InlineNotice
            tone="info"
            icon={<RefreshCw />}
            title="Vuelve a abrirse sola en un momento"
          />
        </ElevatedPanel>
      </main>
    </BrandPanelScreen>
  );
}
