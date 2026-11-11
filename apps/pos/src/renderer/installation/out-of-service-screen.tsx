import { ElevatedPanel, InlineNotice } from "@purosur/ui";
import { Ban } from "lucide-react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";

export function OutOfServiceScreen({ version }: { version: string | null }) {
  return (
    <BrandPanelScreen version={version}>
      <main className="w-full max-w-110">
        <ElevatedPanel tone="error" icon={<Ban />} title="La caja necesita restaurarse">
          <InlineNotice
            tone="error"
            icon={<Ban />}
            title="Su base de datos está dañada"
            description="No puede vender."
          />
        </ElevatedPanel>
      </main>
    </BrandPanelScreen>
  );
}
