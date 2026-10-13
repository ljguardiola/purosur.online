import { HighlightedNotice } from "@purosur/ui";
import { RefreshCw } from "lucide-react";
import { BrandPanelScreen } from "./brand-panel-screen";

export function RegisterUpdatingNotice() {
  return (
    <BrandPanelScreen>
      <div className="w-full max-w-112">
        <HighlightedNotice
          tone="info"
          icon={<RefreshCw />}
          title="Actualizando la caja"
          description="Vuelve a abrirse sola en un momento."
        />
      </div>
    </BrandPanelScreen>
  );
}
