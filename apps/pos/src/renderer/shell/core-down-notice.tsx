import { ElevatedPanel, InlineNotice } from "@purosur/ui";
import { Hourglass } from "lucide-react";
import { BrandPanelScreen } from "./brand-panel-screen";

export function CoreDownNotice({ version }: { version: string | null }) {
  return (
    <BrandPanelScreen version={version}>
      <main className="w-full max-w-110">
        <ElevatedPanel tone="error" icon={<Hourglass />} title="Esperá un momento">
          <InlineNotice
            tone="error"
            icon={<Hourglass />}
            title="La caja vuelve a funcionar sola en unos minutos"
          />
        </ElevatedPanel>
      </main>
    </BrandPanelScreen>
  );
}
