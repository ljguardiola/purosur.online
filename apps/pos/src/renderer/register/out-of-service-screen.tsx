import { HighlightedNotice } from "@purosur/ui";
import { Ban } from "lucide-react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";

export function OutOfServiceScreen() {
  return (
    <BrandPanelScreen>
      <div className="w-full max-w-112">
        <HighlightedNotice
          tone="error"
          icon={<Ban />}
          title="La caja necesita restaurarse"
          description="Su base de datos está dañada, así que no puede vender."
        />
      </div>
    </BrandPanelScreen>
  );
}
