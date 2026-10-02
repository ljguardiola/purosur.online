import { HighlightedNotice } from "@purosur/ui";
import { Hourglass } from "lucide-react";
import { BrandPanelScreen } from "./brand-panel-screen";

export function CoreDownNotice() {
  return (
    <BrandPanelScreen>
      <div className="w-full max-w-112">
        <HighlightedNotice
          tone="error"
          icon={<Hourglass />}
          title="Esperá un momento"
          description="La caja vuelve a funcionar sola en unos minutos."
        />
      </div>
    </BrandPanelScreen>
  );
}
